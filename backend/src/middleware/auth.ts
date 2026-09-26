import { NextFunction, Request, Response } from "express";
import { verifyAuthToken, Role } from "../lib/jwt";
import { UnauthorizedError, ForbiddenError } from "../lib/errors";

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    throw new UnauthorizedError("Missing bearer token");
  }

  try {
    req.user = verifyAuthToken(token);
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }

  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError();
    }
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError(`Requires role: ${roles.join(" or ")}`);
    }
    next();
  };
}
