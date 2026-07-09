// Reads + writes for the pace/HR zone configuration: `app_config` (threshold
// pace), `pace_zones`, `hr_config` (threshold/max/resting HR) and `hr_zones`.
// One home for this cluster so per-user scoping later lands in a single place.
// Today these are global single-row / single-set tables.

import { unstable_cache, revalidateTag } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { recomputeAllCompletedTss } from '@/data/plan-sessions';

// Zone config is global, single-row/single-set, and changes only when the user
// edits it in Settings — so reads are cached (cutting them out of the dashboard's
// per-request query waterfall) and the writes below invalidate the tag. The
// revalidate window is a safety net if a write path is ever missed. When
// per-user scoping lands, the cache key gains the user id.
const ZONES_TAG = 'zones';
const ZONES_REVALIDATE = 3600;

const HR_CONFIG_ID = 1;
const POWER_CONFIG_ID = 1;
const BIKE_HR_CONFIG_ID = 1;

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
export const getThresholdPace = unstable_cache(
  async (): Promise<string | null> => {
    const { data } = await supabaseAdmin
      .from('app_config')
      .select('threshold_pace_per_km')
      .limit(1)
      .maybeSingle();
    return (data?.threshold_pace_per_km as string | null) ?? null;
  },
  ['zones:threshold-pace'],
  { tags: [ZONES_TAG], revalidate: ZONES_REVALIDATE },
);

// Pace zones in display order.
export const listPaceZones = unstable_cache(
  async () => {
    const { data } = await supabaseAdmin.from('pace_zones').select('*').order('sort_order');
    return data ?? [];
  },
  ['zones:pace-zones'],
  { tags: [ZONES_TAG], revalidate: ZONES_REVALIDATE },
);

// HR zones in display order.
export const listHrZones = unstable_cache(
  async () => {
    const { data } = await supabaseAdmin.from('hr_zones').select('*').order('sort_order');
    return data ?? [];
  },
  ['zones:hr-zones'],
  { tags: [ZONES_TAG], revalidate: ZONES_REVALIDATE },
);

// HR config row (threshold/max/resting), or null.
export async function getHrConfig() {
  const { data } = await supabaseAdmin
    .from('hr_config')
    .select('*')
    .eq('id', HR_CONFIG_ID)
    .maybeSingle();
  return data;
}

// Power zones (watts) in display order.
export const listPowerZones = unstable_cache(
  async () => {
    const { data } = await supabaseAdmin.from('power_zones').select('*').order('sort_order');
    return data ?? [];
  },
  ['zones:power-zones'],
  { tags: [ZONES_TAG], revalidate: ZONES_REVALIDATE },
);

// Power (FTP) config row, or null.
export async function getPowerConfig() {
  const { data } = await supabaseAdmin
    .from('power_config')
    .select('*')
    .eq('id', POWER_CONFIG_ID)
    .maybeSingle();
  return data;
}

// Bike-specific HR zones in display order.
export const listBikeHrZones = unstable_cache(
  async () => {
    const { data } = await supabaseAdmin.from('bike_hr_zones').select('*').order('sort_order');
    return data ?? [];
  },
  ['zones:bike-hr-zones'],
  { tags: [ZONES_TAG], revalidate: ZONES_REVALIDATE },
);

// Bike HR config row (threshold/max/resting), or null.
export async function getBikeHrConfig() {
  const { data } = await supabaseAdmin
    .from('bike_hr_config')
    .select('*')
    .eq('id', BIKE_HR_CONFIG_ID)
    .maybeSingle();
  return data;
}

// ── writes ───────────────────────────────────────────────────

// Threshold pace is denormalised across every app_config row — keep them in sync.
export async function setThresholdPace(threshold: string): Promise<void> {
  await supabaseAdmin
    .from('app_config')
    .update({ threshold_pace_per_km: threshold })
    .not('key', 'is', null);
  revalidateTag(ZONES_TAG, 'max');
  // Threshold pace drives run TSS — restore stored completions to the new value.
  await recomputeAllCompletedTss();
}

// Replace a full keyed zone set safely (all four zone tables have PK zone_key):
// upsert the new rows, then delete only the rows whose key is gone. This is
// non-destructive — a failed upsert leaves the existing set intact, unlike the
// old delete-then-insert which could wipe every zone if the insert failed (and
// then report success). Throws on any error so callers never report a false save.
async function replaceKeyedZones(
  table: 'pace_zones' | 'hr_zones' | 'power_zones' | 'bike_hr_zones',
  rows: Array<{ zone_key: string }>,
): Promise<void> {
  if (rows.length) {
    const { error } = await supabaseAdmin.from(table).upsert(rows, { onConflict: 'zone_key' });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  }
  const keep = rows.map(r => r.zone_key);
  const del = keep.length
    ? supabaseAdmin.from(table).delete().not('zone_key', 'in', `(${keep.join(',')})`)
    : supabaseAdmin.from(table).delete().gte('zone_key', '');   // no rows kept → clear all
  const { error } = await del;
  if (error) throw new Error(`${table} prune failed: ${error.message}`);
}

// Replace the full pace-zone set (supports add/remove).
export async function replacePaceZones(rows: PaceZoneRow[]): Promise<void> {
  await replaceKeyedZones('pace_zones', rows);
  revalidateTag(ZONES_TAG, 'max');
}

// Upsert the single HR config row.
export async function saveHrConfig(cfg: HrConfigInput): Promise<void> {
  await supabaseAdmin.from('hr_config').upsert({ id: HR_CONFIG_ID, ...cfg });
  revalidateTag(ZONES_TAG, 'max');
}

// Replace the full HR-zone set (supports add/remove).
export async function replaceHrZones(rows: HrZoneRow[]): Promise<void> {
  await replaceKeyedZones('hr_zones', rows);
  revalidateTag(ZONES_TAG, 'max');
}

// Upsert the single power (FTP) config row.
export async function savePowerConfig(threshold_power: number | null): Promise<void> {
  await supabaseAdmin.from('power_config').upsert({ id: POWER_CONFIG_ID, threshold_power });
  revalidateTag(ZONES_TAG, 'max');
}

// Replace the full power-zone set (supports add/remove).
export async function replacePowerZones(rows: PowerZoneRow[]): Promise<void> {
  await replaceKeyedZones('power_zones', rows);
  revalidateTag(ZONES_TAG, 'max');
  // The Z4 ceiling is the FTP proxy that drives ride TSS — refresh stored rows.
  await recomputeAllCompletedTss();
}

// Upsert the single bike HR config row.
export async function saveBikeHrConfig(cfg: HrConfigInput): Promise<void> {
  await supabaseAdmin.from('bike_hr_config').upsert({ id: BIKE_HR_CONFIG_ID, ...cfg });
  revalidateTag(ZONES_TAG, 'max');
}

// Replace the full bike-HR-zone set (supports add/remove).
export async function replaceBikeHrZones(rows: HrZoneRow[]): Promise<void> {
  await replaceKeyedZones('bike_hr_zones', rows);
  revalidateTag(ZONES_TAG, 'max');
}
