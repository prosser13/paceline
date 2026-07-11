// Single source of truth for the `strava_connection` table. One row per user
// (keyed by user_id), holding that user's Strava OAuth tokens + athlete id. Reads
// and writes are scoped to the current user via `currentUserId()`; the webhook,
// which knows only the inbound Strava athlete id, uses `getUserIdByStravaAthlete()`
// to find which user to sync.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentUserId } from '@/lib/scope';

export interface StravaTokens {
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: number | null;
}

export interface StravaConnectionSummary {
  athlete_name: string | null;
  connected_at: string | null;
  last_synced_at: string | null;
}

export interface StravaConnectionInput {
  athlete_id: number | null;
  athlete_name: string | null;
  access_token: string;
  refresh_token: string;
  token_expires_at: number;
}

// The connected Strava athlete id for the current user, or null.
export async function getStravaAthleteId(): Promise<number | null> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('strava_connection')
    .select('athlete_id')
    .eq('user_id', userId)
    .maybeSingle();
  return (data?.athlete_id as number | null) ?? null;
}

// Resolve which user owns an inbound Strava athlete id (webhook routing). Unscoped
// by design — the webhook carries no session and must map athlete → user.
export async function getUserIdByStravaAthlete(athleteId: number): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('strava_connection')
    .select('user_id')
    .eq('athlete_id', athleteId)
    .maybeSingle();
  return (data?.user_id as string | null) ?? null;
}

// OAuth tokens for the sync engine. Null when there is no connection row.
export async function getStravaTokens(): Promise<StravaTokens | null> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('strava_connection')
    .select('access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .maybeSingle();
  return data ?? null;
}

// Persist refreshed OAuth tokens.
export async function updateStravaTokens(tokens: {
  access_token: string;
  refresh_token: string;
  token_expires_at: number;
}): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('strava_connection').update(tokens).eq('user_id', userId);
}

// Display-only connection details for the settings page.
export async function getStravaConnectionSummary(): Promise<StravaConnectionSummary | null> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('strava_connection')
    .select('athlete_name, connected_at, last_synced_at')
    .eq('user_id', userId)
    .maybeSingle();
  return data ?? null;
}

// Establish (or replace) the current user's connection after a successful OAuth exchange.
export async function upsertStravaConnection(conn: StravaConnectionInput): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('strava_connection').upsert({
    user_id: userId,
    ...conn,
    connected_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

// Stamp the last successful sync time.
export async function markStravaSynced(): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin
    .from('strava_connection')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('user_id', userId);
}

// Clear the current user's connection (disconnect).
export async function clearStravaConnection(): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('strava_connection').update({
    athlete_id:       null,
    athlete_name:     null,
    access_token:     null,
    refresh_token:    null,
    token_expires_at: null,
    connected_at:     null,
    last_synced_at:   null,
  }).eq('user_id', userId);
}
