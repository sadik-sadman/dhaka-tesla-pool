import { PrismaClient } from "@prisma/client";

// Single shared client. Reused across the app instead of instantiating one
// per request, per Prisma's own guidance -- each instance owns a connection
// pool, so multiple instances would exhaust Postgres connections quickly.
export const prisma = new PrismaClient();
