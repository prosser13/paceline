// Single source of truth for the `wellness_days` table — the persistent daily
// store of intervals.icu (Garmin-sourced) biometrics: sleep, HRV, resting HR,
// steps, VO2max, plus CTL/ATL. Written by the scheduled wellness sync
// (src/lib/intervals.ts · syncWellnessDays) and read by the dashboard tiles.
//
// Global (single-athlete) today; this module is the one place that gains user
// scoping under multi-tenancy (add user_id to the key). intervals.icu API access
// stays in src/lib/intervals.ts.

import { supabaseAdmin } from '@/lib/supabase-admin';

export interface WellnessDay {
  date: string;                       // yyyy-mm-dd
  ctl: number | null;
  atl: number | null;
  resting_hr: number | null;
  hrv: number | null;
  sleep_secs: number | null;
  sleep_score: number | null;
  sleep_quality: number | null;
  steps: number | null;
  vo2max: number | null;
  weight: number | null;
  cycling_eftp_w: number | null;
  intervals_updated: string | null;
  raw?: unknown;
}

// Columns the app selects for reads (everything except the bulky raw blob).
const READ_COLS =
  'date, ctl, atl, resting_hr, hrv, sleep_secs, sleep_score, sleep_quality, steps, vo2max, weight, cycling_eftp_w, intervals_updated';

// Upsert a batch of daily rows keyed by date — idempotent, so re-running the
// sync (every 4h) simply overwrites each day with its latest values. Returns the
// number of rows written.
export async function upsertWellnessDays(rows: WellnessDay[]): Promise<number> {
  if (!rows.length) return 0;
  const payload = rows.map(r => ({ ...r, synced_at: new Date().toISOString() }));
  const { error } = await supabaseAdmin
    .from('wellness_days')
    .upsert(payload, { onConflict: 'date' });
  if (error) throw new Error(`wellness_days upsert failed: ${error.message}`);
  return rows.length;
}

// The most recent stored day, or null.
export async function getLatestWellnessDay(): Promise<WellnessDay | null> {
  const { data } = await supabaseAdmin
    .from('wellness_days')
    .select(READ_COLS)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as WellnessDay | null) ?? null;
}

// Recent days in ascending date order (for trend tiles). `days` counts back from
// the latest stored row.
export async function listRecentWellnessDays(days = 30): Promise<WellnessDay[]> {
  const { data } = await supabaseAdmin
    .from('wellness_days')
    .select(READ_COLS)
    .order('date', { ascending: false })
    .limit(days);
  return ((data as WellnessDay[] | null) ?? []).reverse();
}
