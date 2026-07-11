import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Multiple lockfiles exist on this machine (one in the parent C:\Users\pross
  // and one here). Pin the Turbopack root to this project so module resolution
  // uses ./node_modules instead of the inferred parent directory.
  turbopack: {
    root: __dirname,
  },
  // OAuth discovery lives at well-known paths; map them to the API routes that
  // build the metadata (RFC 8414 / RFC 9728) so Claude's MCP connector can find
  // the authorization server for /api/mcp.
  async rewrites() {
    return [
      { source: '/.well-known/oauth-authorization-server', destination: '/api/oauth/metadata/authorization-server' },
      { source: '/.well-known/oauth-protected-resource', destination: '/api/oauth/metadata/protected-resource' },
      // Some clients probe the resource metadata with the resource path appended.
      { source: '/.well-known/oauth-protected-resource/api/mcp', destination: '/api/oauth/metadata/protected-resource' },
      { source: '/.well-known/oauth-authorization-server/api/mcp', destination: '/api/oauth/metadata/authorization-server' },
    ];
  },
};

export default nextConfig;
