import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { signAuthToken } from "../../lib/jwt";
import { ConflictError, UnauthorizedError } from "../../lib/errors";
import { LoginInput, SignupInput } from "./auth.schema";

const SALT_ROUNDS = 10;

// BigInt doesn't survive JSON.stringify -- this is the one place that
// boundary is crossed, so every auth response goes through it.
function toPublicUser(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  walletBalancePaisa: bigint;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    walletBalancePaisa: user.walletBalancePaisa.toString(),
  };
}

export async function signup(input: SignupInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ConflictError("Email already registered");
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          role: input.role,
        },
      });

      if (input.role === "DRIVER") {
        await tx.vehicle.create({
          data: {
            driverId: created.id,
            name: input.vehicleName,
            capacity: input.vehicleCapacity,
          },
        });
      }

      return created;
    });
  } catch (err) {
    // The check above is a read-then-write -- two signups for the same
    // email landing at nearly the same instant can both pass it before
    // either commits, so the database's own unique constraint is the real
    // guard. Without this catch, the loser's raw Prisma P2002 error bubbled
    // up as an unhandled 500 instead of the same clean 409 the sequential
    // case already gets -- found by actually firing two concurrent signups,
    // not by inspection.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ConflictError("Email already registered");
    }
    throw err;
  }

  const token = signAuthToken({ sub: user.id, role: user.role });
  return { token, user: toPublicUser(user) };
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // Same error for "no such user" and "wrong password" -- don't let the
  // response shape leak which emails are registered.
  if (!user) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const token = signAuthToken({ sub: user.id, role: user.role });
  return { token, user: toPublicUser(user) };
}

/**
 * Cash has no wallet to hold a balance in -- it's paid straight to the
 * driver in person -- so "how much cash" only makes sense as a lifetime
 * total, not a live balance. Meaning differs by role: a passenger's total
 * is what they've paid out in cash across their own rides; a driver's is
 * what they've physically collected in cash across every trip their
 * vehicle has served.
 */
async function getCashTotalPaisa(userId: string, role: string): Promise<string> {
  const where =
    role === "DRIVER"
      ? { method: "CASH" as const, rideRequest: { pool: { vehicle: { driverId: userId } } } }
      : { method: "CASH" as const, rideRequest: { passengerId: userId } };

  const result = await prisma.payment.aggregate({ where, _sum: { amountPaisa: true } });
  return (result._sum.amountPaisa ?? 0n).toString();
}

export async function getById(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return null;
  }
  const cashTotalPaisa = await getCashTotalPaisa(user.id, user.role);
  return { ...toPublicUser(user), cashTotalPaisa };
}
