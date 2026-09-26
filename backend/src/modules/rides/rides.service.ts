import { prisma } from "../../lib/prisma";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../lib/errors";
import { haversineKm } from "../../lib/geo";
import { calculateFarePaisa } from "./fare.service";
import { CreateRideRequestInput } from "./rides.schema";

export async function createRideRequest(passengerId: string, input: CreateRideRequestInput) {
  if (input.pickupZoneId === input.destinationZoneId) {
    throw new BadRequestError("Pickup and destination zones must be different");
  }

  const [pickupZone, destinationZone] = await Promise.all([
    prisma.zone.findUnique({ where: { id: input.pickupZoneId } }),
    prisma.zone.findUnique({ where: { id: input.destinationZoneId } }),
  ]);
  if (!pickupZone) throw new NotFoundError("Pickup zone not found");
  if (!destinationZone) throw new NotFoundError("Destination zone not found");

  const distanceKm = haversineKm(pickupZone, destinationZone);
  // Always quoted at the solo (undiscounted) rate -- pooling isn't decided
  // yet at request time, and the actual charge (final_fare_paisa, set on
  // completion) is what applies. See docs/decisions.md#fare-model.
  const estimatedFarePaisa = calculateFarePaisa(distanceKm, false);

  return prisma.rideRequest.create({
    data: {
      passengerId,
      pickupZoneId: input.pickupZoneId,
      destinationZoneId: input.destinationZoneId,
      seatsRequested: input.seatsRequested,
      paymentMethod: input.paymentMethod,
      estimatedFarePaisa,
    },
    include: { pickupZone: true, destinationZone: true },
  });
}

export async function listMyRideRequests(passengerId: string) {
  return prisma.rideRequest.findMany({
    where: { passengerId },
    include: {
      pickupZone: true,
      destinationZone: true,
      pool: { include: { vehicle: true } },
    },
    orderBy: { requestedAt: "desc" },
  });
}

export async function cancelRideRequest(passengerId: string, rideRequestId: string) {
  const rideRequest = await prisma.rideRequest.findUnique({ where: { id: rideRequestId } });
  if (!rideRequest) {
    throw new NotFoundError("Ride request not found");
  }
  // A passenger can only ever see/touch their own ride -- never leak
  // existence vs. ownership by using the same 404 either way.
  if (rideRequest.passengerId !== passengerId) {
    throw new NotFoundError("Ride request not found");
  }
  if (rideRequest.status !== "REQUESTED" && rideRequest.status !== "MATCHED_ACCEPTED") {
    throw new ForbiddenError(`Cannot cancel a ride in status ${rideRequest.status}`);
  }

  return prisma.$transaction(async (tx) => {
    const wasMatched = rideRequest.status === "MATCHED_ACCEPTED" && rideRequest.poolId;

    const updated = await tx.rideRequest.update({
      where: { id: rideRequestId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    if (wasMatched) {
      // Free the seat this request was holding -- the mirror image of the
      // atomic claim in driver.service.ts#acceptRideRequest.
      await tx.pool.update({
        where: { id: rideRequest.poolId! },
        data: { occupiedSeats: { decrement: rideRequest.seatsRequested } },
      });
    }

    await tx.rideStatusHistory.create({
      data: {
        rideRequestId,
        fromStatus: rideRequest.status,
        toStatus: "CANCELLED",
        changedBy: passengerId,
      },
    });

    return updated;
  });
}
