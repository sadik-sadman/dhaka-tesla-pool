// Fail fast on a missing required env var instead of getting a confusing
// runtime error later (e.g. jsonwebtoken throwing deep inside a request).
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  get jwtSecret() {
    return required("JWT_SECRET");
  },
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "1d",
};
