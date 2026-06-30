// Reads for the `plans` and `plan_weeks` tables — the plan structure. One home
// for plan/week access so per-user scoping (add `.eq('user_id', uid)`) later
// lands here rather than across the dashboard, plan page, settings and shell.
//
// `select('*')` reads return Supabase's inferred row type; callers keep their own
// casts (the client isn't yet generated against the DB schema — typing it is a
// separate pass). Narrow reads return explicit shapes.

import { unstable_cache, revalidateTag } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Plan structure (plans + plan_weeks) changes only when a plan is created/edited,
// so the dashboard-critical reads are cached and the plan writes below invalidate
// the tag. The revalidate window is a safety net for any write path that doesn't
// (e.g. admin plan-week edits elsewhere). Per-user scoping later extends the key.
const PLANS_TAG = 'plans';
const PLANS_REVALIDATE = 3600;

export interface NavPlan {
  id: number;
  name: string;
  slug: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface RacePlanRow {
  id: number;
  name: string;
  distance_km: number | null;
  target_time: string | null;
}

export interface NextRace {
  name: string | null;
  race_date: string | null;
  target_time: string | null;
}

// ── plans ────────────────────────────────────────────────────

// Sidebar nav list — active + future plans, earliest first.
export const listNavPlans = unstable_cache(
  async (): Promise<NavPlan[]> => {
    const { data } = await supabaseAdmin
      .from('plans')
      .select('id, name, slug, start_date, end_date')
      .order('start_date');
    return (data ?? []) as NavPlan[];
  },
  ['plans:nav'],
  { tags: [PLANS_TAG], revalidate: PLANS_REVALIDATE },
);

// All plans, most-recently-ended first (archive view).
export async function listPlansByEndDate() {
  const { data } = await supabaseAdmin
    .from('plans')
    .select('*')
    .order('end_date', { ascending: false });
  return data ?? [];
}

// All plans in display order (plan page).
export async function listPlansBySortOrder() {
  const { data } = await supabaseAdmin
    .from('plans')
    .select('*')
    .order('sort_order');
  return data ?? [];
}

// Race plans with their goal time (settings → target times).
export async function listRacePlans(): Promise<RacePlanRow[]> {
  const { data } = await supabaseAdmin
    .from('plans')
    .select('id, name, distance_km, target_time')
    .eq('kind', 'race')
    .order('sort_order');
  return (data ?? []) as RacePlanRow[];
}

// Next upcoming race on/after `fromDate`, or null.
export const getNextRace = unstable_cache(
  async (fromDate: string): Promise<NextRace | null> => {
    const { data } = await supabaseAdmin
      .from('plans')
      .select('name, race_date, target_time')
      .eq('kind', 'race')
      .gte('race_date', fromDate)
      .order('race_date', { ascending: true })
      .limit(1)
      .maybeSingle();
    return (data as NextRace | null) ?? null;
  },
  ['plans:next-race'],
  { tags: [PLANS_TAG], revalidate: PLANS_REVALIDATE },
);

export interface PlanBySlug {
  id: number;
  name: string;
  slug: string | null;
  race_date: string | null;
  distance_km: number | null;
  target_time: string | null;
  target_pace: string | null;
}

// Full plan row for a race-guide hero page, by slug, or null.
export async function getPlanBySlug(slug: string): Promise<PlanBySlug | null> {
  const { data } = await supabaseAdmin
    .from('plans')
    .select('id, name, slug, race_date, distance_km, target_time, target_pace')
    .eq('slug', slug)
    .maybeSingle();
  return (data as PlanBySlug | null) ?? null;
}

// Distance + current goal pace for a plan, or null (target-time form).
export async function getPlanTargetInfo(planId: number): Promise<
  { id: number; distance_km: number | null; target_pace: string | null } | null
> {
  const { data } = await supabaseAdmin
    .from('plans')
    .select('id, distance_km, target_pace')
    .eq('id', planId)
    .single();
  return (data as { id: number; distance_km: number | null; target_pace: string | null } | null) ?? null;
}

// Set a plan's goal time and derived pace.
export async function updatePlanTarget(
  planId: number,
  patch: { target_time: string | null; target_pace: string | null },
): Promise<void> {
  await supabaseAdmin.from('plans').update(patch).eq('id', planId);
  revalidateTag(PLANS_TAG, 'max');
}

// Whether a plan orders strength ahead of running.
export const getPlanStrengthPriority = unstable_cache(
  async (planId: number): Promise<boolean> => {
    const { data } = await supabaseAdmin
      .from('plans')
      .select('strength_priority')
      .eq('id', planId)
      .maybeSingle();
    return !!(data as { strength_priority?: boolean } | null)?.strength_priority;
  },
  ['plans:strength-priority'],
  { tags: [PLANS_TAG], revalidate: PLANS_REVALIDATE },
);

export interface PlanPrefRow {
  id: number;
  name: string;
  kind: string;
  strength_priority: boolean;
}

// Plans with their strength-priority flag, in display order (settings).
export async function listPlanPrefs(): Promise<PlanPrefRow[]> {
  const { data } = await supabaseAdmin
    .from('plans')
    .select('id, name, kind, strength_priority')
    .order('sort_order');
  return (data ?? []) as PlanPrefRow[];
}

// Set whether a plan orders strength ahead of running.
export async function updatePlanStrengthPriority(planId: number, value: boolean): Promise<void> {
  await supabaseAdmin.from('plans').update({ strength_priority: value }).eq('id', planId);
  revalidateTag(PLANS_TAG, 'max');
}

// ── plan_weeks ───────────────────────────────────────────────

// The plan week containing `onDate`, or null.
export const getCurrentWeek = unstable_cache(
  async (onDate: string) => {
    const { data } = await supabaseAdmin
      .from('plan_weeks')
      .select('*')
      .lte('date_from', onDate)
      .gte('date_to', onDate)
      .maybeSingle();
    return data;
  },
  ['plans:current-week'],
  { tags: [PLANS_TAG], revalidate: PLANS_REVALIDATE },
);

// All weeks in week-number order (plan page).
export async function listWeeksByNumber() {
  const { data } = await supabaseAdmin
    .from('plan_weeks')
    .select('*')
    .order('week_number');
  return data ?? [];
}

// Weeks for a plan with planned volume — drives the weekly running-volume chart.
export async function listPlanWeeks(planId: number): Promise<
  { week_number: number; phase: string; date_from: string; date_to: string; planned_volume_km: number | null }[]
> {
  const { data } = await supabaseAdmin
    .from('plan_weeks')
    .select('week_number, phase, date_from, date_to, planned_volume_km')
    .eq('plan_id', planId)
    .order('week_number');
  return (data ?? []).map(w => ({
    week_number: w.week_number as number,
    phase: w.phase as string,
    date_from: w.date_from as string,
    date_to: w.date_to as string,
    planned_volume_km: w.planned_volume_km != null ? Number(w.planned_volume_km) : null,
  }));
}

// Phase timeline for a plan — weeks in order with just the timeline fields.
export const listPlanPhaseWeeks = unstable_cache(
  async (planId: number): Promise<
    { phase: string; date_from: string; date_to: string; week_number: number }[]
  > => {
    const { data } = await supabaseAdmin
      .from('plan_weeks')
      .select('phase, date_from, date_to, week_number')
      .eq('plan_id', planId)
      .order('week_number');
    return (data ?? []) as { phase: string; date_from: string; date_to: string; week_number: number }[];
  },
  ['plans:phase-weeks'],
  { tags: [PLANS_TAG], revalidate: PLANS_REVALIDATE },
);
