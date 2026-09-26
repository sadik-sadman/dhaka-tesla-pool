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
}
