// Dynamic Client Registration (RFC 7591). Claude POSTs its redirect_uris and gets
// back a client_id — so the user never types one in. Public clients (PKCE), no
// secret issued.
import { registerClient } from '@/data/oauth';

export const dynamic = 'force-dynamic';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': '*' };

export async function POST(request: Request): Promise<Response> {
  let body: { redirect_uris?: unknown; client_name?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_client_metadata', error_description: 'Body must be JSON' }, { status: 400, headers: CORS });
  }

  const uris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u))
    : [];
  if (!uris.length) {
    return Response.json({ error: 'invalid_redirect_uri', error_description: 'At least one http(s) redirect_uri is required' }, { status: 400, headers: CORS });
  }

  const clientName = typeof body.client_name === 'string' ? body.client_name : null;
  const client = await registerClient(uris, clientName);

  return Response.json({
    client_id: client.client_id,
    client_name: client.client_name,
    redirect_uris: client.redirect_uris,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  }, { status: 201, headers: CORS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
