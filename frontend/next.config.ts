import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Minimal, self-contained production build (only the files actually
  // needed at runtime, own node_modules subset) -- this is what the
  // Dockerfile copies out; see docs/architecture.md#environments.
  output: "standalone",
};

export default nextConfig;
