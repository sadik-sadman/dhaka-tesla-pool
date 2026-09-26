import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { BadRequestError, ConflictError, NotFoundError } from "../../lib/errors";
import { SetDriverStatusInput } from "./driver.schema";

const ACTIVE_POOL_STATUSES = ["MATCHED_ACCEPTED", "DRIVER_ARRIVED", "STARTED"] as const;

async function getVehicleForDriver(driverId: string) {
  const vehicle = await prisma.vehicle.findUnique({ where: { driverId } });
  if (!vehicle) {
    throw new NotFoundError("No vehicle registered for this driver");
  }
  return vehicle;
}

export async function setDriverStatus(driverId: string, input: SetDriverStatusInput) {
  const vehicle = await getVehicleForDriver(driverId);

  if (input.status === "OFFLINE") {
    const activePool = await prisma.pool.findFirst({
      where: { vehicleId: vehicle.id, status: { in: [...ACTIVE_POOL_STATUSES] } },
    });
    if (activePool) {
      throw new ConflictError("Cannot go offline with a trip in progress");
    }
    return prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { status: "OFFLINE", currentZoneId: null },
    });
  }

  return prisma.vehicle.update({
    where: { id: vehicle.id },
    data: { status: "ONLINE", currentZoneId: input.currentZoneId },
  });
}

/**
 * Requests visible to this driver: pending (REQUESTED), same pickup zone as
 * where the vehicle currently is -- the "in about a second" candidate list
 * from the PRD's Section 1 story. Whether one of these can actually be
 * *accepted* right now (corridor compatibility with whatever pool is
 * already in progress, remaining capacity) is authoritatively decided by
 * acceptRideRequest, not here -- see docs/decisions.md#driver-accept-
 * semantics.
 */
export async function listRelevantRequests(driverId: string) {
  const vehicle = await getVehicleForDriver(driverId);
  if (vehicle.status !== "ONLINE" || !vehicle.currentZoneId) {
    return [];
  }

  return prisma.rideRequest.findMany({
    where: { status: "REQUESTED", pickupZoneId: vehicle.currentZoneId },
    include: {
      pickupZone: true,
      destinationZone: true,
      passenger: { select: { id: true, name: true } },
    },
    orderBy: { requestedAt: "asc" },
  });
}

type VehicleRow = Awaited<ReturnType<typeof getVehicleForDriver>>;
type RideRequestWithDestination = Prisma.RideRequestGetPayload<{ include: { destinationZone: true } }>;

/**
 * Finds the vehicle's current non-terminal pool, validating this request is
 * actually compatible with it -- or creates a new one if the vehicle is
 * idle. Returns null only when a concurrent request won the race to create
 * the first pool (see the pools_one_active_per_vehicle migration); the
 * caller retries once, which will then find that pool via the first branch.
 */
async function getOrCreateActivePool(vehicle: VehicleRow, rideRequest: RideRequestWithDestination) {
  const existing = await prisma.pool.findFirst({
    where: { vehicleId: vehicle.id, status: { in: [...ACTIVE_POOL_STATUSES] } },
    include: {
      rideRequests: { where: { status: { not: "CANCELLED" } }, include: { destinationZone: true } },
    },
  });

  if (existing) {
    if (existing.status !== "MATCHED_ACCEPTED") {
      throw new ConflictError("This vehicle's current trip has already started -- pooling window is closed");
    }
    if (existing.pickupZoneId !== rideRequest.pickupZoneId) {
      throw new ConflictError("This vehicle is already committed to a different pickup zone");
    }
    const corridorMatch = existing.rideRequests.some(
      (member) => member.destinationZone.corridor === rideRequest.destinationZone.corridor,
    );
    if (!corridorMatch) {
      throw new ConflictError("This request's destination isn't compatible with the vehicle's current pool");
    }
    return existing;
  }

  try {
    return await prisma.pool.create({
      data: { vehicleId: vehicle.id, pickupZoneId: rideRequest.pickupZoneId, occupiedSeats: 0 },
      include: { rideRequests: { where: { status: { not: "CANCELLED" } }, include: { destinationZone: true } } },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return null;
    }
    throw err;
  }
}

export async function acceptRideRequest(driverId: string, rideRequestId: string) {
  const vehicle = await getVehicleForDriver(driverId);
  if (vehicle.status !== "ONLINE") {
    throw new ConflictError("Vehicle must be online to accept a ride");
  }

  const rideRequest = await prisma.rideRequest.findUnique({
    where: { id: rideRequestId },
    include: { destinationZone: true },
  });
  if (!rideRequest) {
    throw new NotFoundError("Ride request not found");
  }
  if (rideRequest.status !== "REQUESTED") {
    throw new ConflictError(`Ride request is already ${rideRequest.status}`);
  }
  if (rideRequest.pickupZoneId !== vehicle.currentZoneId) {
    throw new BadRequestError("This request's pickup zone doesn't match where this vehicle is");
  }

  // At most one retry: if two accepts race to create the first pool for an
  // idle vehicle, the loser's insert is rejected by the DB (P2002) -- the
  // winner's pool now exists, so the retry finds and joins it instead of
  // failing a request that's actually still perfectly acceptable.
  let pool = await getOrCreateActivePool(vehicle, rideRequest);
  if (!pool) {
    pool = await getOrCreateActivePool(vehicle, rideRequest);
  }
  if (!pool) {
    throw new ConflictError("Could not accept this request, please try again");
  }
  const poolId = pool.id;

  return prisma.$transaction(async (tx) => {
    // The capacity-safe claim: a single conditional UPDATE, not a
    // read-then-write. See docs/decisions.md#concurrency.
    const claimed = await tx.$executeRaw`
      UPDATE pools
      SET occupied_seats = occupied_seats + ${rideRequest.seatsRequested}
      WHERE id = ${poolId}::uuid
        AND occupied_seats + ${rideRequest.seatsRequested} <= ${vehicle.capacity}
    `;

    if (claimed === 0) {
      throw new ConflictError("Not enough seats left on this vehicle");
    }

    const updatedRequest = await tx.rideRequest.update({
      where: { id: rideRequestId },
      data: { status: "MATCHED_ACCEPTED", poolId },
    });

    await tx.rideStatusHistory.create({
      data: {
        rideRequestId,
        fromStatus: "REQUESTED",
        toStatus: "MATCHED_ACCEPTED",
        changedBy: driverId,
      },
    });

    return updatedRequest;
  });
}
