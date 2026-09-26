// Tests must not depend on a developer's local .env existing -- set safe
// defaults for anything a pure unit test needs (e.g. signing a JWT) if it
// isn't already set.
process.env.JWT_SECRET ??= "test-secret-do-not-use-in-real-deployments";
process.env.JWT_EXPIRES_IN ??= "1h";
