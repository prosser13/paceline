// Reads for the `plans` and `plan_weeks` tables — the plan structure. One home
// for plan/week access, scoped per user.
//
// Multi-tenant: reads/writes are scoped to the current user via `currentUserId()`.
// Cached reads pass the user id as the FIRST argument to the `unstable_cache`-wrapped
// inner function (so it's part of the cache key); the public function keeps its
// original signature and resolves the user before calling the cached inner.
//
// `select('*')` reads return Supabase's inferred row type; callers keep their own
// casts. Narrow reads return explicit shapes.

import { unstable_cache, revalidateTag } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentUserId } from '@/lib/scope';

// Plan structure (plans + plan_weeks) changes only when a plan is created/edited,
// so the dashboard-critical reads are cached and the plan writes below invalidate
// the tag. The user id is part of each cache key (passed as an argument), so one
// user's plans never serve another's; a write invalidates the shared tag.
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
  slug: string | null;
}

// ── plans ────────────────────────────────────────────────────

// Sidebar nav list — active + future plans, earliest first.
const _listNavPlans = unstable_cache(
  async (userId: string): Promise<NavPlan[]> => {
    const { data } = await supabaseAdmin
      .from('plans')
      .select('id, name, slug, start_date, end_date')
      .eq('user_id', userId)
      .order('start_date');
    return (data ?? []) as NavPlan[];
  },
  ['plans:nav'],
  { tags: [PLANS_TAG], revalidate: PLANS_REVALIDATE },
);
export async function listNavPlans(): Promise<NavPlan[]> {
  return _listNavPlans(await currentUserId());
}

// All plans, most-recently-ended first (archive view).
export async function listPlansByEndDate() {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('plans')
    .select('*')
    .eq('user_id', userId)
    .order('end_date', { ascending: false });
  return data ?? [];
}

// All plans in display order (plan page).
export async function listPlansBySortOrder() {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('plans')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order');
  return data ?? [];
}

// Race plans with their goal time (settings → target times).
export async function listRacePlans(): Promise<RacePlanRow[]> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('plans')
    .select('id, name, distance_km, target_time')
    .eq('user_id', userId)
    .eq('kind', 'race')
    .order('sort_order');
  return (data ?? []) as RacePlanRow[];
}

export interface UpcomingPlan {
  name: string;
  start_date: string;
  end_date: string | null;
  slug: string | null;
}

// The next training block that hasn't started yet — the earliest plan whose
// start_date is after `fromDate`. Drives the dashboard "starts in N days" state
// when no block is currently active. Null when nothing is scheduled ahead.
export async function getUpcomingPlan(fromDate: string): Promise<UpcomingPlan | null> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('plans')
    .select('name, start_date, end_date, slug')
    .eq('user_id', userId)
    .gt('start_date', fromDate)
    .order('start_date', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as UpcomingPlan | null) ?? null;
}

// Next upcoming race on/after `fromDate`, or null.
const _getNextRace = unstable_cache(
  async (userId: string, fromDate: string): Promise<NextRace | null> => {
    const { data } = await supabaseAdmin
      .from('plans')
      .select('name, race_date, target_time, slug')
      .eq('user_id', userId)
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
export async function getNextRace(fromDate: string): Promise<NextRace | null> {
  return _getNextRace(await currentUserId(), fromDate);
}

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
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('plans')
    .select('id, name, slug, race_date, distance_km, target_time, target_pace')
    .eq('user_id', userId)
    .eq('slug', slug)
    .maybeSingle();
  return (data as PlanBySlug | null) ?? null;
}

// Distance + current goal pace for a plan, or null (target-time form).
export async function getPlanTargetInfo(planId: number): Promise<
  { id: number; distance_km: number | null; target_pace: string | null } | null
> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('plans')
    .select('id, distance_km, target_pace')
    .eq('user_id', userId)
    .eq('id', planId)
    .single();
  return (data as { id: number; distance_km: number | null; target_pace: string | null } | null) ?? null;
}

// Set a plan's goal time and derived pace.
export async function updatePlanTarget(
  planId: number,
  patch: { target_time: string | null; target_pace: string | null },
): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('plans').update(patch).eq('user_id', userId).eq('id', planId);
  revalidateTag(PLANS_TAG, 'max');
}

// Whether a plan orders strength ahead of running.
const _getPlanStrengthPriority = unstable_cache(
  async (userId: string, planId: number): Promise<boolean> => {
    const { data } = await supabaseAdmin
      .from('plans')
      .select('strength_priority')
      .eq('user_id', userId)
      .eq('id', planId)
      .maybeSingle();
    return !!(data as { strength_priority?: boolean } | null)?.strength_priority;
  },
  ['plans:strength-priority'],
  { tags: [PLANS_TAG], revalidate: PLANS_REVALIDATE },
);
export async function getPlanStrengthPriority(planId: number): Promise<boolean> {
  return _getPlanStrengthPriority(await currentUserId(), planId);
}

export interface PlanPrefRow {
  id: number;
  name: string;
  kind: string;
  strength_priority: boolean;
}

// Plans with their strength-priority flag, in display order (settings).
export async function listPlanPrefs(): Promise<PlanPrefRow[]> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('plans')
    .select('id, name, kind, strength_priority')
    .eq('user_id', userId)
    .order('sort_order');
  return (data ?? []) as PlanPrefRow[];
}

// Set whether a plan orders strength ahead of running.
export async function updatePlanStrengthPriority(planId: number, value: boolean): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('plans').update({ strength_priority: value }).eq('user_id', userId).eq('id', planId);
  revalidateTag(PLANS_TAG, 'max');
}

// ── plan_weeks ───────────────────────────────────────────────

// The plan week containing `onDate`, or null. If two plans' weeks overlap the date
// (e.g. a supplementary block), maybeSingle() would error and null out the whole
// dashboard week + disable plan autonomy — so order + limit to deterministically
// take the most-recently-started plan's week instead.
const _getCurrentWeek = unstable_cache(
  async (userId: string, onDate: string) => {
    const { data } = await supabaseAdmin
      .from('plan_weeks')
      .select('*')
      .eq('user_id', userId)
      .lte('date_from', onDate)
      .gte('date_to', onDate)
      .order('date_from', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  },
  ['plans:current-week'],
  { tags: [PLANS_TAG], revalidate: PLANS_REVALIDATE },
);
export async function getCurrentWeek(onDate: string) {
  return _getCurrentWeek(await currentUserId(), onDate);
}

// All weeks in week-number order (plan page).
export async function listWeeksByNumber() {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('plan_weeks')
    .select('*')
    .eq('user_id', userId)
    .order('week_number');
  return data ?? [];
}

// Weeks for a plan (phase + date span) — the frame for the weekly running-volume
// chart. NOTE: `planned_volume_km` is legacy and no longer authoritative; volume
// is now derived from the week's run sessions via weekRunKm (see weekly-volume.ts).
// The column is still returned for backwards-compat but callers should not render it.
export async function listPlanWeeks(planId: number): Promise<
  { week_number: number; phase: string; date_from: string; date_to: string; planned_volume_km: number | null }[]
> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('plan_weeks')
    .select('week_number, phase, date_from, date_to, planned_volume_km')
    .eq('user_id', userId)
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
const _listPlanPhaseWeeks = unstable_cache(
  async (userId: string, planId: number): Promise<
    { phase: string; date_from: string; date_to: string; week_number: number }[]
  > => {
    const { data } = await supabaseAdmin
      .from('plan_weeks')
      .select('phase, date_from, date_to, week_number')
      .eq('user_id', userId)
      .eq('plan_id', planId)
      .order('week_number');
    return (data ?? []) as { phase: string; date_from: string; date_to: string; week_number: number }[];
  },
  ['plans:phase-weeks'],
  { tags: [PLANS_TAG], revalidate: PLANS_REVALIDATE },
);
export async function listPlanPhaseWeeks(planId: number): Promise<
  { phase: string; date_from: string; date_to: string; week_number: number }[]
> {
  return _listPlanPhaseWeeks(await currentUserId(), planId);
}
