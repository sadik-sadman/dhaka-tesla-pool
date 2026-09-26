import { PrismaClient } from "@prisma/client";

// Single shared client. Reused across the app instead of instantiating one
// per request, per Prisma's own guidance -- each instance owns a connection
// pool, so multiple instances would exhaust Postgres connections quickly.
//
// `let`, not `const`: TypeScript's CommonJS output reads this through the
// module's exports object on every access, so integration tests can swap it
// for a client pointed at an ephemeral test database (see
// setPrismaClient/src/test/db.ts) before any service code runs a query,
// without touching a single service file's import.
export let prisma = new PrismaClient();

export function setPrismaClient(client: PrismaClient): void {
  prisma = client;
}
