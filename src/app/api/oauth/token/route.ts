// OAuth 2.1 token endpoint. Exchanges an authorization code (with PKCE) for an
// access token, and rotates refresh tokens. Public clients — no client secret;
// possession of the code + PKCE code_verifier is the proof.
import { consumeAuthCode, issueTokens, rotateRefreshToken, pkceS256 } from '@/data/oauth';

export const dynamic = 'force-dynamic';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': '*' };

function err(code: string, description: string, status = 400): Response {
  return Response.json({ error: code, error_description: description }, { status, headers: CORS });
}

async function readParams(request: Request): Promise<Record<string, string>> {
  const ct = request.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    const j = await request.json().catch(() => ({}));
    return Object.fromEntries(Object.entries(j as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
  }
  const form = await request.formData();
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) out[k] = String(v);
  return out;
}

export async function POST(request: Request): Promise<Response> {
  const p = await readParams(request);
  const now = Date.now();

  if (p.grant_type === 'authorization_code') {
    if (!p.code || !p.redirect_uri || !p.client_id || !p.code_verifier) {
      return err('invalid_request', 'code, redirect_uri, client_id and code_verifier are required');
    }
    const row = await consumeAuthCode(p.code, now);
    if (!row) return err('invalid_grant', 'Authorization code is invalid or expired');
    if (row.client_id !== p.client_id) return err('invalid_grant', 'client_id mismatch');
    if (row.redirect_uri !== p.redirect_uri) return err('invalid_grant', 'redirect_uri mismatch');
    // PKCE (S256 only) — the verifier must hash to the stored challenge.
    if (row.code_challenge_method !== 'S256' || pkceS256(p.code_verifier) !== row.code_challenge) {
      return err('invalid_grant', 'PKCE verification failed');
    }
    const tokens = await issueTokens(row.client_id, row.user_id, row.scope, now);
    return Response.json(
      { access_token: tokens.access_token, token_type: 'Bearer', expires_in: tokens.expires_in, refresh_token: tokens.refresh_token, scope: row.scope ?? 'mcp' },
      { headers: CORS },
    );
  }

  if (p.grant_type === 'refresh_token') {
    if (!p.refresh_token || !p.client_id) return err('invalid_request', 'refresh_token and client_id are required');
    const tokens = await rotateRefreshToken(p.refresh_token, p.client_id, now);
    if (!tokens) return err('invalid_grant', 'Refresh token is invalid');
    return Response.json(
      { access_token: tokens.access_token, token_type: 'Bearer', expires_in: tokens.expires_in, refresh_token: tokens.refresh_token, scope: 'mcp' },
      { headers: CORS },
    );
  }

  return err('unsupported_grant_type', `Unsupported grant_type: ${p.grant_type ?? '(none)'}`);
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
