// Reads + writes for the pace/HR zone configuration: `app_config` (threshold
// pace), `pace_zones`, `hr_config` (threshold/max/resting HR) and `hr_zones`.
// One home for this cluster, scoped per user.
//
// Multi-tenant: every read/write is scoped to the current user, resolved from the
// request/scope via `currentUserId()` (src/lib/scope.ts). Cached reads can't call
// `currentUserId()` inside the cached body (the key wouldn't vary by user), so the
// user id is passed as an argument to the `unstable_cache`-wrapped inner function —
// `unstable_cache` folds arguments into the cache key, giving per-user caching for
// free. The public function keeps its original signature (resolves the user, then
// calls the cached inner), so no caller changes.

import { unstable_cache, revalidateTag } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentUserId } from '@/lib/scope';
import { recomputeAllCompletedTss } from '@/data/plan-sessions';

// Zone config changes only when the user edits it in Settings — so reads are cached
// (cutting them out of the dashboard's per-request query waterfall) and the writes
// below invalidate the tag. The revalidate window is a safety net if a write path is
// ever missed. The user id is part of each cache key (passed as an argument), so one
// user's config never serves another's; a write invalidates the shared tag (harmless
// over-invalidation across the handful of users).
const ZONES_TAG = 'zones';
const ZONES_REVALIDATE = 3600;

export interface PaceZoneRow {
  zone_key: string;
  name: string;
  pace_min: string;
  pace_max: string;
  sort_order: number;
}

export interface HrZoneRow {
  zone_key: string;
  name: string;
  hr_min: number;
  hr_max: number;
  sort_order: number;
}

export interface HrConfigInput {
  threshold_hr: number | null;
  max_hr: number | null;
  resting_hr: number | null;
}

export interface PowerZoneRow {
  zone_key: string;
  name: string;
  power_min: number;
  power_max: number;
  sort_order: number;
}

// ── reads ────────────────────────────────────────────────────

// Threshold pace ("m:ss" per km), or null if unset.
const _getThresholdPace = unstable_cache(
  async (userId: string): Promise<string | null> => {
    const { data } = await supabaseAdmin
      .from('app_config')
      .select('threshold_pace_per_km')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    return (data?.threshold_pace_per_km as string | null) ?? null;
  },
  ['zones:threshold-pace'],
  { tags: [ZONES_TAG], revalidate: ZONES_REVALIDATE },
);
export async function getThresholdPace(): Promise<string | null> {
  return _getThresholdPace(await currentUserId());
}

// Pace zones in display order.
const _listPaceZones = unstable_cache(
  async (userId: string) => {
    const { data } = await supabaseAdmin
      .from('pace_zones').select('*').eq('user_id', userId).order('sort_order');
    return data ?? [];
  },
  ['zones:pace-zones'],
  { tags: [ZONES_TAG], revalidate: ZONES_REVALIDATE },
);
export async function listPaceZones() {
  return _listPaceZones(await currentUserId());
}

// HR zones in display order.
const _listHrZones = unstable_cache(
  async (userId: string) => {
    const { data } = await supabaseAdmin
      .from('hr_zones').select('*').eq('user_id', userId).order('sort_order');
    return data ?? [];
  },
  ['zones:hr-zones'],
  { tags: [ZONES_TAG], revalidate: ZONES_REVALIDATE },
);
export async function listHrZones() {
  return _listHrZones(await currentUserId());
}

// HR config row (threshold/max/resting), or null.
export async function getHrConfig() {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('hr_config')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

// Power zones (watts) in display order.
const _listPowerZones = unstable_cache(
  async (userId: string) => {
    const { data } = await supabaseAdmin
      .from('power_zones').select('*').eq('user_id', userId).order('sort_order');
    return data ?? [];
  },
  ['zones:power-zones'],
  { tags: [ZONES_TAG], revalidate: ZONES_REVALIDATE },
);
export async function listPowerZones() {
  return _listPowerZones(await currentUserId());
}

// Power (FTP) config row, or null.
export async function getPowerConfig() {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('power_config')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

// Bike-specific HR zones in display order.
const _listBikeHrZones = unstable_cache(
  async (userId: string) => {
    const { data } = await supabaseAdmin
      .from('bike_hr_zones').select('*').eq('user_id', userId).order('sort_order');
    return data ?? [];
  },
  ['zones:bike-hr-zones'],
  { tags: [ZONES_TAG], revalidate: ZONES_REVALIDATE },
);
export async function listBikeHrZones() {
  return _listBikeHrZones(await currentUserId());
}

// Bike HR config row (threshold/max/resting), or null.
export async function getBikeHrConfig() {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('bike_hr_config')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

// ── writes ───────────────────────────────────────────────────

// Threshold pace is denormalised across every app_config row for this user — keep
// them in sync.
export async function setThresholdPace(threshold: string): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin
    .from('app_config')
    .update({ threshold_pace_per_km: threshold })
    .eq('user_id', userId);
  revalidateTag(ZONES_TAG, 'max');
  // Threshold pace drives run TSS — restore stored completions to the new value.
  await recomputeAllCompletedTss();
}

// Replace a full keyed zone set safely (all four zone tables are keyed per user by
// zone_key): upsert the new rows, then delete only this user's rows whose key is
// gone. Non-destructive — a failed upsert leaves the existing set intact. Throws on
// any error so callers never report a false save.
async function replaceKeyedZones(
  userId: string,
  table: 'pace_zones' | 'hr_zones' | 'power_zones' | 'bike_hr_zones',
  rows: Array<{ zone_key: string }>,
): Promise<void> {
  if (rows.length) {
    const scoped = rows.map(r => ({ ...r, user_id: userId }));
    const { error } = await supabaseAdmin
      .from(table).upsert(scoped, { onConflict: 'user_id,zone_key' });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  }
  const keep = rows.map(r => r.zone_key);
  const del = keep.length
    ? supabaseAdmin.from(table).delete().eq('user_id', userId).not('zone_key', 'in', `(${keep.join(',')})`)
    : supabaseAdmin.from(table).delete().eq('user_id', userId);   // no rows kept → clear all
  const { error } = await del;
  if (error) throw new Error(`${table} prune failed: ${error.message}`);
}

// Replace the full pace-zone set (supports add/remove).
export async function replacePaceZones(rows: PaceZoneRow[]): Promise<void> {
  await replaceKeyedZones(await currentUserId(), 'pace_zones', rows);
  revalidateTag(ZONES_TAG, 'max');
}

// Upsert the single HR config row.
export async function saveHrConfig(cfg: HrConfigInput): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('hr_config').upsert({ user_id: userId, ...cfg }, { onConflict: 'user_id' });
  revalidateTag(ZONES_TAG, 'max');
}

// Replace the full HR-zone set (supports add/remove).
export async function replaceHrZones(rows: HrZoneRow[]): Promise<void> {
  await replaceKeyedZones(await currentUserId(), 'hr_zones', rows);
  revalidateTag(ZONES_TAG, 'max');
}

// Upsert the single power (FTP) config row.
export async function savePowerConfig(threshold_power: number | null): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin
    .from('power_config').upsert({ user_id: userId, threshold_power }, { onConflict: 'user_id' });
  revalidateTag(ZONES_TAG, 'max');
}

// Replace the full power-zone set (supports add/remove).
export async function replacePowerZones(rows: PowerZoneRow[]): Promise<void> {
  await replaceKeyedZones(await currentUserId(), 'power_zones', rows);
  revalidateTag(ZONES_TAG, 'max');
  // The Z4 ceiling is the FTP proxy that drives ride TSS — refresh stored rows.
  await recomputeAllCompletedTss();
}

// Upsert the single bike HR config row.
export async function saveBikeHrConfig(cfg: HrConfigInput): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('bike_hr_config').upsert({ user_id: userId, ...cfg }, { onConflict: 'user_id' });
  revalidateTag(ZONES_TAG, 'max');
}

// Replace the full bike-HR-zone set (supports add/remove).
export async function replaceBikeHrZones(rows: HrZoneRow[]): Promise<void> {
  await replaceKeyedZones(await currentUserId(), 'bike_hr_zones', rows);
  revalidateTag(ZONES_TAG, 'max');
}
