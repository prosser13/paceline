// OAuth 2.1 store + helpers for the MCP server (PKCE + Dynamic Client Registration).
// Secrets (auth codes, access/refresh tokens) are persisted only as SHA-256 hashes;
// the plaintext is returned once to the caller. Pure server-side (service role).

import { createHash, randomBytes } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';

const ACCESS_TTL_SECS = 60 * 60;   // 1 hour; refresh tokens rotate rather than expire
const CODE_TTL_SECS = 60 * 10;     // 10 minutes

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
function rand(prefix: string): string {
  return prefix + randomBytes(32).toString('base64url');
}

// base64url(sha256(verifier)) — the S256 PKCE transform. Compare to the stored
// code_challenge to prove the token requester is the one who started the flow.
export function pkceS256(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

// ── clients (Dynamic Client Registration) ──

export interface OAuthClient { client_id: string; client_name: string | null; redirect_uris: string[]; }

export async function registerClient(redirectUris: string[], clientName?: string | null): Promise<OAuthClient> {
  const client_id = rand('pcl_');
  await supabaseAdmin.from('oauth_clients').insert({
    client_id, client_name: clientName ?? null, redirect_uris: redirectUris,
  });
  return { client_id, client_name: clientName ?? null, redirect_uris: redirectUris };
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  const { data } = await supabaseAdmin
    .from('oauth_clients')
    .select('client_id, client_name, redirect_uris')
    .eq('client_id', clientId)
    .maybeSingle();
  return (data as OAuthClient | null) ?? null;
}

// ── authorization codes ──

export async function createAuthCode(input: {
  clientId: string; userId: string; redirectUri: string;
  codeChallenge: string; codeChallengeMethod: string; resource?: string | null; scope?: string | null;
  nowMs: number;
}): Promise<string> {
  const code = rand('pac_');
  await supabaseAdmin.from('oauth_auth_codes').insert({
    code_hash: sha256(code),
    client_id: input.clientId,
    user_id: input.userId,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    code_challenge_method: input.codeChallengeMethod,
    resource: input.resource ?? null,
    scope: input.scope ?? null,
    expires_at: new Date(input.nowMs + CODE_TTL_SECS * 1000).toISOString(),
  });
  return code;
}

export interface AuthCodeRow {
  client_id: string; user_id: string; redirect_uri: string;
  code_challenge: string; code_challenge_method: string; scope: string | null; expires_at: string;
}

// Single-use: delete-returning so consumption is atomic. Two concurrent token
// requests for the same code race on the DELETE; only the one whose delete affects
// the row gets it back — the other sees no rows and fails. (A plain select-then-delete
// let both read the row first and mint two token pairs.) Rejects if expired.
export async function consumeAuthCode(code: string, nowMs: number): Promise<AuthCodeRow | null> {
  const hash = sha256(code);
  const { data } = await supabaseAdmin
    .from('oauth_auth_codes')
    .delete()
    .eq('code_hash', hash)
    .select('client_id, user_id, redirect_uri, code_challenge, code_challenge_method, scope, expires_at')
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at as string).getTime() < nowMs) return null;
  return data as AuthCodeRow;
}

// ── access / refresh tokens ──

export interface IssuedTokens { access_token: string; refresh_token: string; expires_in: number; }

export async function issueTokens(clientId: string, userId: string, scope: string | null, nowMs: number): Promise<IssuedTokens> {
  const access_token = rand('pat_');
  const refresh_token = rand('prt_');
  await supabaseAdmin.from('oauth_tokens').insert({
    access_token_hash: sha256(access_token),
    refresh_token_hash: sha256(refresh_token),
    client_id: clientId,
    user_id: userId,
    scope,
    expires_at: new Date(nowMs + ACCESS_TTL_SECS * 1000).toISOString(),
  });
  return { access_token, refresh_token, expires_in: ACCESS_TTL_SECS };
}

// Resolve an access token → user + whether it may write (scope includes 'mcp:write'),
// honouring expiry. Null on miss/expired.
export async function resolveAccessToken(token: string | null | undefined, nowMs: number): Promise<{ userId: string; canWrite: boolean } | null> {
  if (!token) return null;
  const { data } = await supabaseAdmin
    .from('oauth_tokens')
    .select('user_id, scope, expires_at')
    .eq('access_token_hash', sha256(token))
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at as string).getTime() < nowMs) return null;
  return {
    userId: data.user_id as string,
    canWrite: ((data.scope as string | null) ?? '').split(' ').includes('mcp:write'),
  };
}

// Rotate a refresh token: atomically consume the old row (delete-returning, scoped to
// the presenting client so a wrong client_id neither matches nor burns the token) and
// issue a fresh pair. Null if invalid. The atomic delete also prevents a concurrent
// double-rotation minting two live token pairs from one refresh token.
export async function rotateRefreshToken(refreshToken: string, clientId: string, nowMs: number): Promise<IssuedTokens | null> {
  const { data } = await supabaseAdmin
    .from('oauth_tokens')
    .delete()
    .eq('refresh_token_hash', sha256(refreshToken))
    .eq('client_id', clientId)
    .select('user_id, scope')
    .maybeSingle();
  if (!data) return null;
  return issueTokens(clientId, data.user_id as string, (data.scope as string | null) ?? null, nowMs);
}
