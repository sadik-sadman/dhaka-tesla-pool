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
