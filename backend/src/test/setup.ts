// Tests must not depend on a developer's local .env existing -- set safe
// defaults for anything a pure unit test needs (e.g. signing a JWT) if it
// isn't already set.
process.env.JWT_SECRET ??= "test-secret-do-not-use-in-real-deployments";
process.env.JWT_EXPIRES_IN ??= "1h";

// A placeholder so `new PrismaClient()` doesn't throw at module-load time
// (before any test's beforeAll has run). Integration tests immediately
// replace the shared client via setPrismaClient() with one pointed at a
// real ephemeral test database -- see src/test/db.ts.
process.env.DATABASE_URL ??= "postgresql://placeholder:placeholder@127.0.0.1:1/placeholder";
