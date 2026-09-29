// Local dev convenience: runs the same ephemeral, real-Postgres-wire-
// protocol database the test suite uses (see src/test/db.ts), but leaves it
// running so `npm run dev` (or a browser session against it) has something
// to talk to when Docker/a real Postgres server isn't available -- e.g.
// this sandbox. Not used by the test suite itself (each test file starts
// and tears down its own instance) and not part of the production path
// (docker-compose.yml runs real postgres:16-alpine) -- purely a dev
// convenience for a machine without Docker.
import { startTestDatabase } from "../src/test/db";

// Fixed, not OS-assigned: so DATABASE_URL only ever needs to be set once in
// backend/.env, instead of changing (and needing to be re-copied) every
// single time this script restarts. 5433 rather than Postgres's usual 5432,
// specifically to avoid colliding with a real Postgres instance that might
// already be running on this machine for something else.
const DEV_DB_PORT = Number(process.env.DEV_DB_PORT ?? 5433);

async function main() {
  const db = await startTestDatabase({ port: DEV_DB_PORT });
  // pgbouncer=true tells Prisma's query engine to skip named prepared
  // statements. Needed specifically for this long-lived PGlite instance
  // (unlike the test suite's one-fresh-instance-per-file pattern, this one
  // outlives multiple separate client processes -- the seed script, then
  // the dev server -- and PGlite's socket layer doesn't isolate prepared-
  // statement names per client connection the way real Postgres does, so a
  // second client's first query collides with "s0" already registered by
  // the first: `PostgresError 42P05: prepared statement "s0" already
  // exists`. Real Postgres in docker-compose has no such limitation and
  // doesn't need this flag.
  const devDatabaseUrl = `${db.databaseUrl}&pgbouncer=true`;
  console.log("Dev database ready. Set this in backend/.env and frontend/.env.local:");
  console.log(`DATABASE_URL="${devDatabaseUrl}"`);
  console.log("Press Ctrl+C to stop.");

  process.on("SIGINT", async () => {
    console.log("\nStopping dev database...");
    await db.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
