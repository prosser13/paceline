// OAuth 2.0 Protected Resource Metadata (RFC 9728). Served at
// /.well-known/oauth-protected-resource via a rewrite (see next.config.ts). Points
// Claude at the authorization server for the /api/mcp resource.
import { originFromRequest } from '@/lib/base-url';

export const dynamic = 'force-dynamic';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': '*' };

export function GET(request: Request): Response {
  const origin = originFromRequest(request);
  return Response.json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
  }, { headers: CORS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
