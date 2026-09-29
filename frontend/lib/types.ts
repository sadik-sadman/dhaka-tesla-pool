// Mirrors the shapes the backend's routes actually return (see
// backend/src/modules/auth/auth.service.ts#toPublicUser and the
// serializeBigInt'd ride-request responses) -- kept as plain types here
// rather than shared package, since the two are still small and separate
// deployables (see docs/architecture.md).
export type Role = "PASSENGER" | "DRIVER";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  walletBalancePaisa: string;
  // Only present on GET /api/auth/me (see auth.service.ts#getCashTotalPaisa),
  // not on the leaner login/signup response -- a lifetime cash total, not a
  // live balance, since cash has no wallet to hold one in.
  cashTotalPaisa?: string;
}

export interface AuthResponse {
  token: string;
  user: PublicUser;
}

export interface Zone {
  id: string;
  name: string;
  corridor: string;
  lat: number;
  lng: number;
}

export type RideStatus =
  | "REQUESTED"
  | "MATCHED_ACCEPTED"
  | "DRIVER_ARRIVED"
  | "STARTED"
  | "COMPLETED"
  | "CANCELLED";

export type PaymentMethod = "CASH" | "TESLAPAY";

export interface RideRequest {
  id: string;
  pickupZoneId: string;
  destinationZoneId: string;
  pickupZone: Zone;
  destinationZone: Zone;
  seatsRequested: number;
  status: RideStatus;
  poolId: string | null;
  paymentMethod: PaymentMethod;
  estimatedFarePaisa: string;
  finalFarePaisa: string | null;
  requestedAt: string;
  cancelledAt: string | null;
  // Present on driver-facing responses (relevant requests, pool members);
  // absent on a passenger's own /api/rides list, where it'd just be them.
  passenger?: { id: string; name: string };
}

export type VehicleStatus = "OFFLINE" | "ONLINE";

export interface Vehicle {
  id: string;
  driverId: string;
  name: string;
  capacity: number;
  status: VehicleStatus;
  currentZoneId: string | null;
}

export interface Pool {
  id: string;
  vehicleId: string;
  pickupZoneId: string;
  pickupZone?: Zone;
  status: RideStatus;
  occupiedSeats: number;
  completedAt?: string | null;
  rideRequests: RideRequest[];
}

export interface DriverDashboardState {
  vehicle: Vehicle;
  pool: Pool | null;
}
