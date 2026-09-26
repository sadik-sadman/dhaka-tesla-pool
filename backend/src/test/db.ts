import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { exec } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const address = srv.address();
      if (address && typeof address === "object") {
        const port = address.port;
        srv.close(() => resolve(port));
      } else {
        reject(new Error("Could not determine a free port"));
      }
    });
    srv.on("error", reject);
  });
}

export interface TestDatabase {
  databaseUrl: string;
  stop: () => Promise<void>;
}

/**
 * Spins up an ephemeral, real Postgres-wire-protocol server (PGlite, a WASM
 * build of actual Postgres) and applies this project's real migration files
 * to it via `prisma migrate deploy` -- the same command the Docker image
 * runs. No Docker/external Postgres install needed, and no Prisma driver-
 * adapter code diverging from the production path: tests and Docker both
 * talk to a plain `postgresql://` DATABASE_URL through the same Prisma
 * Client. See docs/architecture.md#environments.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const db = new PGlite();
  const port = await getFreePort();
  const server = new PGLiteSocketServer({
    db,
    port,
    host: "127.0.0.1",
    maxConnections: 10,
  });
  await server.start();

  const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?schema=public`;
  const schemaPath = path.join(__dirname, "../../prisma/schema.prisma");

  // Must be the async exec, not execSync: the PGlite socket server above
  // runs in-process and only accepts/serves connections when this process's
  // event loop is free to run. execSync blocks that event loop for the
  // entire lifetime of the child process, so `prisma migrate deploy` would
  // never be able to reach it (P1001, connection refused) -- discovered by
  // actually running this, not by inspection.
  await execAsync(`npx prisma migrate deploy --schema="${schemaPath}"`, {
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  return {
    databaseUrl,
    stop: async () => {
      // pglite-socket schedules some of its own connection-close cleanup via
      // setImmediate; if db.close() tears down the WASM module before that
      // cleanup callback runs, it throws reading a now-undefined internal
      // field. Harmless (it's pure teardown, after every real assertion has
      // already run), but noisy and can crash a test worker -- give it one
      // tick to run first, and don't let a leftover teardown race fail an
      // otherwise-passing test.
      await new Promise((resolve) => setImmediate(resolve));
      try {
        await server.stop();
        await db.close();
      } catch (err) {
        console.warn("startTestDatabase: non-fatal teardown error", err);
      }
    },
  };
}
