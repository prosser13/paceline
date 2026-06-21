// Reads + writes for the pace/HR zone configuration: `app_config` (threshold
// pace), `pace_zones`, `hr_config` (threshold/max/resting HR) and `hr_zones`.
// One home for this cluster so per-user scoping later lands in a single place.
// Today these are global single-row / single-set tables.

import { supabaseAdmin } from '@/lib/supabase-admin';

const HR_CONFIG_ID = 1;

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

// ── reads ────────────────────────────────────────────────────

// Threshold pace ("m:ss" per km), or null if unset.
export async function getThresholdPace(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('app_config')
    .select('threshold_pace_per_km')
    .limit(1)
    .maybeSingle();
  return (data?.threshold_pace_per_km as string | null) ?? null;
}

// Pace zones in display order.
export async function listPaceZones() {
  const { data } = await supabaseAdmin.from('pace_zones').select('*').order('sort_order');
  return data ?? [];
}

// HR zones in display order.
export async function listHrZones() {
  const { data } = await supabaseAdmin.from('hr_zones').select('*').order('sort_order');
  return data ?? [];
}

// HR config row (threshold/max/resting), or null.
export async function getHrConfig() {
  const { data } = await supabaseAdmin
    .from('hr_config')
    .select('*')
    .eq('id', HR_CONFIG_ID)
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
}

// Replace the full pace-zone set (supports add/remove).
export async function replacePaceZones(rows: PaceZoneRow[]): Promise<void> {
  await supabaseAdmin.from('pace_zones').delete().gte('sort_order', 0);
  if (rows.length) await supabaseAdmin.from('pace_zones').insert(rows);
}

// Upsert the single HR config row.
export async function saveHrConfig(cfg: HrConfigInput): Promise<void> {
  await supabaseAdmin.from('hr_config').upsert({ id: HR_CONFIG_ID, ...cfg });
}

// Replace the full HR-zone set (supports add/remove).
export async function replaceHrZones(rows: HrZoneRow[]): Promise<void> {
  await supabaseAdmin.from('hr_zones').delete().gte('sort_order', 0);
  if (rows.length) await supabaseAdmin.from('hr_zones').insert(rows);
}
