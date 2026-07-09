// Single source of truth for the `strava_connection` table. Today there is one
// global connection row (id: 1); when the app goes multi-tenant this module is
// the one place that gains user scoping (id → user_id), instead of the ~7 call
// sites that previously queried the table directly.

import { supabaseAdmin } from '@/lib/supabase-admin';

const CONNECTION_ID = 1;

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

// The connected Strava athlete id, or null. Used to verify inbound webhook events
// belong to the owner before spending Strava API budget on a sync.
export async function getStravaAthleteId(): Promise<number | null> {
  const { data } = await supabaseAdmin
    .from('strava_connection')
    .select('athlete_id')
    .eq('id', CONNECTION_ID)
    .maybeSingle();
  return (data?.athlete_id as number | null) ?? null;
}

// OAuth tokens for the sync engine. Null when there is no connection row.
export async function getStravaTokens(): Promise<StravaTokens | null> {
  const { data } = await supabaseAdmin
    .from('strava_connection')
    .select('access_token, refresh_token, token_expires_at')
    .eq('id', CONNECTION_ID)
    .single();
  return data ?? null;
}

// Persist refreshed OAuth tokens.
export async function updateStravaTokens(tokens: {
  access_token: string;
  refresh_token: string;
  token_expires_at: number;
}): Promise<void> {
  await supabaseAdmin.from('strava_connection').update(tokens).eq('id', CONNECTION_ID);
}

// Display-only connection details for the settings page.
export async function getStravaConnectionSummary(): Promise<StravaConnectionSummary | null> {
  const { data } = await supabaseAdmin
    .from('strava_connection')
    .select('athlete_name, connected_at, last_synced_at')
    .eq('id', CONNECTION_ID)
    .single();
  return data ?? null;
}

// Establish (or replace) the connection after a successful OAuth exchange.
export async function upsertStravaConnection(conn: StravaConnectionInput): Promise<void> {
  await supabaseAdmin.from('strava_connection').upsert({
    id: CONNECTION_ID,
    ...conn,
    connected_at: new Date().toISOString(),
  });
}

// Stamp the last successful sync time.
export async function markStravaSynced(): Promise<void> {
  await supabaseAdmin
    .from('strava_connection')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', CONNECTION_ID);
}

// Clear the connection (disconnect). Ready for the disconnect route to adopt.
export async function clearStravaConnection(): Promise<void> {
  await supabaseAdmin.from('strava_connection').update({
    athlete_id:       null,
    athlete_name:     null,
    access_token:     null,
    refresh_token:    null,
    token_expires_at: null,
    connected_at:     null,
    last_synced_at:   null,
  }).eq('id', CONNECTION_ID);
}
