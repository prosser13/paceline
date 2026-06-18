import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Multiple lockfiles exist on this machine (one in the parent C:\Users\pross
  // and one here). Pin the Turbopack root to this project so module resolution
  // uses ./node_modules instead of the inferred parent directory.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
