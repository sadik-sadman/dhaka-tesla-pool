import bcrypt from "bcryptjs";
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

  const user = await prisma.$transaction(async (tx) => {
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

export async function getById(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return user ? toPublicUser(user) : null;
}
