// Per-user integration credentials — the multi-tenant replacement for the global
// env vars `INTERVALS_API_KEY` / `TELEGRAM_CHAT_ID` and the hardcoded intervals.icu
// athlete id. One row per user in `user_integrations`. Reads/writes for the current
// user resolve via `currentUserId()`; the cron jobs enumerate all configured users
// with `listUsersWithIntegrations()` and open a scope per user.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentUserId } from '@/lib/scope';

export interface UserIntegrations {
  intervals_api_key: string | null;
  intervals_athlete_id: string | null;
  telegram_chat_id: string | null;
  intervals_workout_sync: boolean;
}

// intervals.icu creds resolved for a sync call. Null fields mean "not configured".
export interface IntervalsCreds {
  athleteId: string | null;
  apiKey: string | null;
}

const COLS = 'intervals_api_key, intervals_athlete_id, telegram_chat_id, intervals_workout_sync';

// The current user's integration row (all fields), or null if none saved yet.
export async function getUserIntegrations(): Promise<UserIntegrations | null> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('user_integrations')
    .select(COLS)
    .eq('user_id', userId)
    .maybeSingle();
  return (data as UserIntegrations | null) ?? null;
}

// intervals.icu creds for the current user (or explicit user via scope).
export async function getIntervalsCreds(): Promise<IntervalsCreds> {
  const row = await getUserIntegrations();
  return { athleteId: row?.intervals_athlete_id ?? null, apiKey: row?.intervals_api_key ?? null };
}

// The current user's Telegram chat id, or null if not configured.
export async function getTelegramChatId(): Promise<string | null> {
  const row = await getUserIntegrations();
  return row?.telegram_chat_id ?? null;
}

// Whether the current user has opted into pushing planned runs to intervals.icu.
export async function getIntervalsWorkoutSync(): Promise<boolean> {
  const row = await getUserIntegrations();
  return row?.intervals_workout_sync ?? false;
}

// Partial update of the current user's integration credentials. Only provided keys
// change; a null intervals_api_key explicitly clears it.
export async function upsertUserIntegrations(patch: Partial<{
  intervals_api_key: string | null;
  intervals_athlete_id: string | null;
  telegram_chat_id: string | null;
  intervals_workout_sync: boolean;
}>): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin
    .from('user_integrations')
    .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
}

// All users who have any integration configured — the set the cron jobs iterate. A
// user counts if they have an intervals key OR a Telegram chat id OR a Strava
// connection (checked separately by the caller). Returns user ids.
export async function listUsersWithIntegrations(): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('user_integrations')
    .select('user_id, intervals_api_key, telegram_chat_id');
  return (data ?? [])
    .filter(r => r.intervals_api_key || r.telegram_chat_id)
    .map(r => r.user_id as string);
}
