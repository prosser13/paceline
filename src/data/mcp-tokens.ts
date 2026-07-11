// Per-user bearer tokens for the read-only MCP server (see src/app/api/mcp).
// Only the SHA-256 hash is stored; the plaintext token is returned once at issue
// time and never persisted. One token per user — issuing replaces the prior one.
//
// issue/revoke/info run in a browser session (scoped via currentUserId). resolve()
// is the inverse — it turns a bearer token into the owning user id, so it must NOT
// use currentUserId (it establishes identity for a session-less MCP request).

import { createHash, randomBytes } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentUserId } from '@/lib/scope';

const TOKEN_PREFIX = 'pmcp_';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Mint a fresh token for the current user, replacing any existing one. `canWrite`
// grants the write tools (scope 'read write'); default is read-only. Returns the
// plaintext — the ONLY time it exists outside the client; the DB keeps only its hash.
export async function issueMcpToken(canWrite = false): Promise<string> {
  const userId = await currentUserId();
  const token = TOKEN_PREFIX + randomBytes(32).toString('base64url');
  await supabaseAdmin.from('mcp_tokens').upsert(
    {
      user_id: userId, token_hash: hashToken(token),
      scopes: canWrite ? 'read write' : 'read',
      created_at: new Date().toISOString(), last_used_at: null,
    },
    { onConflict: 'user_id' },
  );
  return token;
}

export async function revokeMcpToken(): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('mcp_tokens').delete().eq('user_id', userId);
}

export interface McpTokenInfo {
  exists: boolean;
  canWrite: boolean;
  createdAt: string | null;
  lastUsedAt: string | null;
}

export async function getMcpTokenInfo(): Promise<McpTokenInfo> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('mcp_tokens')
    .select('created_at, last_used_at, scopes')
    .eq('user_id', userId)
    .maybeSingle();
  return {
    exists: !!data,
    canWrite: ((data?.scopes as string | undefined) ?? '').split(' ').includes('write'),
    createdAt: (data?.created_at as string | null | undefined) ?? null,
    lastUsedAt: (data?.last_used_at as string | null | undefined) ?? null,
  };
}

// Resolve a bearer token to its owning user + whether it may write, or null. Stamps
// last_used_at on a hit. Identity-establishing — does not (and must not) read
// currentUserId.
export async function resolveMcpToken(token: string | null | undefined): Promise<{ userId: string; canWrite: boolean } | null> {
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;
  const { data } = await supabaseAdmin
    .from('mcp_tokens')
    .select('user_id, scopes')
    .eq('token_hash', hashToken(token))
    .maybeSingle();
  const userId = (data?.user_id as string | undefined) ?? null;
  if (!userId) return null;
  await supabaseAdmin.from('mcp_tokens').update({ last_used_at: new Date().toISOString() }).eq('user_id', userId);
  return { userId, canWrite: ((data?.scopes as string | undefined) ?? '').split(' ').includes('write') };
}
