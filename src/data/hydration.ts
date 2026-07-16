// Hydration data layer (Málaga hydration wave). Owns the single-row
// `hydration_config` (the athlete's sweat-sodium concentration) AND — like
// src/data/fuel.ts does for the fuel columns — is the sanctioned writer of the
// hydration columns on `completed_workouts` (weight_before/after, fluid, the
// derived sweat rate, and the run's temperature). This is the second, deliberate
// cross-cluster write; see docs/architecture.md §6.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentUserId } from '@/lib/scope';
import { getWeatherConfig, effectiveLocation } from '@/data/weather-config';
import { getRaceWeatherHistory } from '@/lib/weather';
import { sweatLossL, sweatRateLh, DEFAULT_FLUID_OPTS } from '@/lib/hydration';

export const DEFAULT_SWEAT_SODIUM_MG_L = 553;
export const DEFAULT_GUT_CAP_ML = DEFAULT_FLUID_OPTS.gutCapMl;   // 800 ml/h
export const DEFAULT_ACTIVITY_FACTOR = 1.3;                      // light daily-living activity

export interface HydrationInput {
  weightBeforeKg: number | null;
  weightAfterKg: number | null;
  fluidMl: number | null;
  runTempC?: number | null;    // manual override; auto-fetched when omitted
}

export interface HydrationRun {
  id: string;
  date: string;
  km: number;
  movingSecs: number | null;
  ngpMinKm: number | null;
  weightBeforeKg: number | null;
  weightAfterKg: number | null;
  fluidMl: number | null;
  runTempC: number | null;
  sweatRateLh: number | null;
}

// ── config ────────────────────────────────────────────────────

// The athlete's sweat-sodium concentration (mg/L), defaulting to 553 when unset.
export async function getSweatSodium(): Promise<number> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('hydration_config')
    .select('sweat_sodium_mg_l')
    .eq('user_id', userId)
    .maybeSingle();
  const v = data?.sweat_sodium_mg_l;
  return v != null ? Number(v) : DEFAULT_SWEAT_SODIUM_MG_L;
}

export async function setSweatSodium(mgPerL: number): Promise<void> {
  if (!(mgPerL > 0)) return;
  const userId = await currentUserId();
  await supabaseAdmin
    .from('hydration_config')
    .upsert({ user_id: userId, sweat_sodium_mg_l: mgPerL, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
}

// The athlete's race fluid gut-tolerance cap (ml/h), defaulting to 800 when unset —
// caps the personalised race fluid recommendation so it stays realistic.
export async function getGutCapMl(): Promise<number> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('hydration_config')
    .select('gut_cap_ml')
    .eq('user_id', userId)
    .maybeSingle();
  const v = data?.gut_cap_ml;
  return v != null ? Number(v) : DEFAULT_GUT_CAP_ML;
}

export async function setGutCap(ml: number): Promise<void> {
  if (!(ml > 0)) return;
  const userId = await currentUserId();
  await supabaseAdmin
    .from('hydration_config')
    .upsert({ user_id: userId, gut_cap_ml: ml, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
}

// The athlete's base metabolic rate (kcal/day), manually entered (e.g. the figure
// Garmin/intervals.icu reports). Null when unset — the calorie tile then prompts
// for it rather than guessing.
export async function getBmrKcal(): Promise<number | null> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('hydration_config')
    .select('bmr_kcal')
    .eq('user_id', userId)
    .maybeSingle();
  const v = data?.bmr_kcal;
  return v != null ? Number(v) : null;
}

export async function setBmrKcal(kcal: number): Promise<void> {
  if (!(kcal > 0)) return;
  const userId = await currentUserId();
  await supabaseAdmin
    .from('hydration_config')
    .upsert({ user_id: userId, bmr_kcal: Math.round(kcal), updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
}

// The daily-living activity factor applied to BMR for the non-exercise part of the
// day, defaulting to 1.3 (lightly active) when unset. Planned exercise is added on
// top separately, so this stays a light, sedentary-to-light multiplier.
export async function getActivityFactor(): Promise<number> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('hydration_config')
    .select('activity_factor')
    .eq('user_id', userId)
    .maybeSingle();
  const v = data?.activity_factor;
  return v != null ? Number(v) : DEFAULT_ACTIVITY_FACTOR;
}

export async function setActivityFactor(factor: number): Promise<void> {
  if (!(factor > 0)) return;
  const userId = await currentUserId();
  await supabaseAdmin
    .from('hydration_config')
    .upsert({ user_id: userId, activity_factor: factor, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
}

// The athlete's most recent known bodyweight (kg), for the calorie estimate.
// Prefers the daily wellness weight (intervals.icu-synced); falls back to the most
// recent per-run weigh-in (weight_before_kg) when no daily weight exists — many
// athletes weigh in before runs (the hydration feature) but don't sync a daily
// weight. Null when neither is available.
export async function getLatestBodyweightKg(): Promise<number | null> {
  const userId = await currentUserId();
  const { data: w } = await supabaseAdmin
    .from('wellness_days')
    .select('weight')
    .eq('user_id', userId)
    .not('weight', 'is', null)
    .order('date', { ascending: false })
    .limit(1).maybeSingle();
  if (w?.weight != null) return Number(w.weight);

  const { data: run } = await supabaseAdmin
    .from('completed_workouts')
    .select('weight_before_kg')
    .eq('user_id', userId)
    .not('weight_before_kg', 'is', null)
    .order('completed_date', { ascending: false })
    .limit(1).maybeSingle();
  return run?.weight_before_kg != null ? Number(run.weight_before_kg) : null;
}

// ── per-run write ─────────────────────────────────────────────

// The run's temperature from the weather archive: the athlete's home/override
// location at the run's date, picking the configured default hour (else the day's
// high). Null when there's no location configured or the fetch fails.
async function fetchRunTemp(dateISO: string): Promise<number | null> {
  const cfg = await getWeatherConfig();
  const loc = effectiveLocation(cfg);
  if (!loc) return null;
  const res = await getRaceWeatherHistory(loc.lat, loc.lng, dateISO);
  if (!res) return null;
  const hour = cfg?.default_hour;
  const match = hour != null
    ? res.forecast.hours.find(h => h.hourLabel === `${String(hour).padStart(2, '0')}:00`)
    : null;
  return match ? match.tempC : res.forecast.high;
}

// Save the weigh-in + fluid for a completion. Computes the sweat rate when both
// weights and a moving time are present; resolves the run temperature (manual
// override wins, else auto-fetched) when both weights exist.
export async function saveRunHydration(
  completedId: string,
  input: HydrationInput,
  movingSecs: number | null,
): Promise<{ sweatRateLh: number | null; runTempC: number | null }> {
  const userId = await currentUserId();
  const { weightBeforeKg, weightAfterKg, fluidMl } = input;

  const loss = sweatLossL(weightBeforeKg, weightAfterKg, fluidMl);
  const rate = sweatRateLh(loss, movingSecs);
  const rateRounded = rate != null ? Math.round(rate * 100) / 100 : null;

  // Resolve temperature only when there's a weigh-in to attach it to.
  let runTempC = input.runTempC ?? null;
  const haveWeights = weightBeforeKg != null && weightAfterKg != null;
  if (runTempC == null && haveWeights) {
    const { data: row } = await supabaseAdmin
      .from('completed_workouts')
      .select('completed_date')
      .eq('id', completedId)
      .eq('user_id', userId)
      .maybeSingle();
    const date = row?.completed_date as string | undefined;
    if (date) runTempC = await fetchRunTemp(date);
  }

  await supabaseAdmin
    .from('completed_workouts')
    .update({
      weight_before_kg: weightBeforeKg,
      weight_after_kg: weightAfterKg,
      fluid_ml: fluidMl,
      sweat_rate_l_per_h: rateRounded,
      run_temp_c: runTempC,
    })
    .eq('id', completedId)
    .eq('user_id', userId);

  return { sweatRateLh: rateRounded, runTempC };
}

// ── read ──────────────────────────────────────────────────────

// Every completed RUN since `since` that has a weigh-in logged — any distance
// (the sweat model wants data across conditions, not just long runs).
export async function listHydrationRunsSince(since: string): Promise<HydrationRun[]> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('id, completed_date, actual_distance_km, actual_duration_secs, actual_duration_mins, actual_ngp_min_km, actual_avg_pace_min_km, weight_before_kg, weight_after_kg, fluid_ml, sweat_rate_l_per_h, run_temp_c, plan_sessions!inner(activity_type, distance_km)')
    .eq('user_id', userId)
    .eq('plan_sessions.activity_type', 'running')
    .gte('completed_date', since)
    .not('weight_before_kg', 'is', null);

  return (data ?? []).flatMap(r => {
    if (!r.completed_date) return [];
    const ps = (Array.isArray(r.plan_sessions) ? r.plan_sessions[0] : r.plan_sessions) as
      { distance_km: number | null } | null;
    const km = r.actual_distance_km != null ? Number(r.actual_distance_km)
      : ps?.distance_km != null ? Number(ps.distance_km) : 0;
    const movingSecs = r.actual_duration_secs != null ? Number(r.actual_duration_secs)
      : r.actual_duration_mins != null ? Math.round(Number(r.actual_duration_mins) * 60) : null;
    const ngp = r.actual_ngp_min_km != null ? Number(r.actual_ngp_min_km)
      : r.actual_avg_pace_min_km != null ? Number(r.actual_avg_pace_min_km) : null;
    return [{
      id: r.id as string,
      date: r.completed_date as string,
      km,
      movingSecs,
      ngpMinKm: ngp,
      weightBeforeKg: r.weight_before_kg != null ? Number(r.weight_before_kg) : null,
      weightAfterKg: r.weight_after_kg != null ? Number(r.weight_after_kg) : null,
      fluidMl: r.fluid_ml != null ? Number(r.fluid_ml) : null,
      runTempC: r.run_temp_c != null ? Number(r.run_temp_c) : null,
      sweatRateLh: r.sweat_rate_l_per_h != null ? Number(r.sweat_rate_l_per_h) : null,
    }];
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export interface NutritionRun {
  id: string;
  date: string;
  name: string | null;
  km: number;
  movingSecs: number | null;
  fuelCarbsPerH: number | null;
  fuelItems: { name: string; carbs_g: number; qty: number }[] | null;
  weightBeforeKg: number | null;
  weightAfterKg: number | null;
  fluidMl: number | null;
  runTempC: number | null;
  weighed: boolean;
}

// Recent completed runs (any distance) with their fuel/weigh-in state — powers the
// benchmarks "log a recent run" surface so weigh-ins can be entered/backfilled from
// one place, not just on a long run's row. Most recent first.
export async function listRecentRunsForNutrition(since: string, limit = 12): Promise<NutritionRun[]> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('completed_workouts')
    .select('id, completed_date, actual_distance_km, actual_duration_secs, actual_duration_mins, fuel_carbs_per_h, fuel_items, weight_before_kg, weight_after_kg, fluid_ml, run_temp_c, plan_sessions!inner(name, activity_type, distance_km)')
    .eq('user_id', userId)
    .eq('plan_sessions.activity_type', 'running')
    .gte('completed_date', since)
    .order('completed_date', { ascending: false })
    .limit(limit);

  return (data ?? []).flatMap(r => {
    if (!r.completed_date) return [];
    const ps = (Array.isArray(r.plan_sessions) ? r.plan_sessions[0] : r.plan_sessions) as
      { name: string | null; distance_km: number | null } | null;
    const km = r.actual_distance_km != null ? Number(r.actual_distance_km)
      : ps?.distance_km != null ? Number(ps.distance_km) : 0;
    const movingSecs = r.actual_duration_secs != null ? Number(r.actual_duration_secs)
      : r.actual_duration_mins != null ? Math.round(Number(r.actual_duration_mins) * 60) : null;
    return [{
      id: r.id as string,
      date: r.completed_date as string,
      name: ps?.name ?? null,
      km,
      movingSecs,
      fuelCarbsPerH: r.fuel_carbs_per_h != null ? Number(r.fuel_carbs_per_h) : null,
      fuelItems: (r.fuel_items as { name: string; carbs_g: number; qty: number }[] | null) ?? null,
      weightBeforeKg: r.weight_before_kg != null ? Number(r.weight_before_kg) : null,
      weightAfterKg: r.weight_after_kg != null ? Number(r.weight_after_kg) : null,
      fluidMl: r.fluid_ml != null ? Number(r.fluid_ml) : null,
      runTempC: r.run_temp_c != null ? Number(r.run_temp_c) : null,
      weighed: r.weight_before_kg != null,
    }];
  });
}
