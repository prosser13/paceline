// Server-shared cache of the Garmin OAuth2 bearer (single-row `garmin_auth`). Reused
// across serverless invocations so we mint at most one bearer per ~hour rather than
// re-exchanging on every cold start — Garmin rate-limits the exchange endpoint hard.

import { supabaseAdmin } from '@/lib/supabase-admin';

export interface CachedBearer { token: string; expiresAt: number }

// The stored bearer if still valid (with a safety margin), else null.
export async function getCachedBearer(marginMs = 60_000): Promise<CachedBearer | null> {
  const { data } = await supabaseAdmin
    .from('garmin_auth')
    .select('access_token, expires_at')
    .eq('id', 1)
    .maybeSingle();
  if (!data?.access_token || !data.expires_at) return null;
  const expiresAt = Date.parse(data.expires_at as string);
  if (!(expiresAt > Date.now() + marginMs)) return null;
  return { token: data.access_token as string, expiresAt };
}

// Store a freshly minted bearer for reuse.
export async function saveCachedBearer(token: string, expiresAt: number): Promise<void> {
  await supabaseAdmin
    .from('garmin_auth')
    .upsert({ id: 1, access_token: token, expires_at: new Date(expiresAt).toISOString(), updated_at: new Date().toISOString() });
}
