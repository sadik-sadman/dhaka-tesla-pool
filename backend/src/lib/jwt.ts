import jwt from "jsonwebtoken";
import { env } from "../config/env";

export type Role = "PASSENGER" | "DRIVER";

export interface AuthTokenPayload {
  sub: string; // user id
  role: Role;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"] });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, env.jwtSecret);
  if (typeof decoded === "string" || !("sub" in decoded) || !("role" in decoded)) {
    throw new Error("Invalid token payload");
  }
  return { sub: decoded.sub as string, role: decoded.role as Role };
}
