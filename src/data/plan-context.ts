// The plan-agent briefing — one deterministic read a fresh coaching session loads
// to understand the current state before reviewing or changing the plan. Assembles
// the plan, the near-term schedule (the editable surface), recent adherence,
// wellness, the zones used to set targets, and the coaching inputs (constraints +
// autonomy + the recent change log). See docs/plan-agent.md for the contract.
//
// This is a READ. It never mutates. Mutations go through the (forthcoming) logged
// adjustment path so every change is auditable and reversible.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { getCurrentWeek } from '@/data/plans';
import { getWellnessCacheRow } from '@/data/wellness-cache';
import { listPlanConstraints, getCoachingPrefs } from '@/data/coaching';
import {
  getThresholdPace, listPaceZones, getHrConfig, listHrZones,
  getPowerConfig, listPowerZones,
} from '@/data/zones';
import { STRENGTH_EXERCISES } from '@/data/strength-exercises';

// Static reference an agent needs to author edits, bundled into the briefing so a
// fresh session has it without searching the codebase. `structure` is shaped
// differently for runs vs strength — see session_schemas; strength exercise_ids
// come from exercise_catalog.
const SESSION_SCHEMAS = {
  run: {
    field: 'structure (jsonb array of phases)',
    phase: { phase: 'string, e.g. "Z2" | "Ultra pace" | "Tempo"', description: 'string', pace_per_km: 'string "m:ss"', duration_mins: 'number' },
    note: 'Phase distances should sum to distance_km. target_pace is the headline/quality pace.',
    example: [
      { phase: 'Z2', description: '11km easy Z2', pace_per_km: '5:00', duration_mins: 55 },
      { phase: 'Ultra pace', description: '10km at 5:30/km ultra pace', pace_per_km: '5:30', duration_mins: 55 },
    ],
  },
  strength: {
    field: 'structure (jsonb array of exercises)',
    exercise: { name: 'string', sets: 'number', reps: 'number', reps_type: "'reps' | 'secs'", weight: 'number kg | null (bodyweight/band)', target: 'string, e.g. "Chest"', exercise_id: 'number — from reference.exercise_catalog' },
    note: 'CORE sessions use the same shape as STRENGTH.',
    example: [{ name: 'Push-up', sets: 3, reps: 12, reps_type: 'reps', weight: null, target: 'Chest', exercise_id: 62 }],
  },
} as const;

// Compact catalog — enough to author a strength entry (id + sensible defaults)
// without loading the full library. Built once at module load.
const EXERCISE_CATALOG = STRENGTH_EXERCISES.map(e => ({
  id: e.id, name: e.name, group: e.group, reps_type: e.repsType,
  sets: e.sets, reps: e.repsValue, weight_kg: e.weightKg, weight_type: e.weightType,
}));

// How far forward the editable schedule reaches, and how far back adherence looks.
const UPCOMING_DAYS = 14;
const RECENT_DAYS = 14;
const CHANGE_LOG_LIMIT = 20;

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Planning fields the agent reasons over / may change. `id` is the address for a
// later change; `structure` is the per-segment prescription.
const SESSION_FIELDS =
  'id, plan_id, scheduled_date, day_of_week, am_pm, session_type, activity_type, ' +
  'name, description, distance_km, target_pace, target_pace_end, estimated_tss, ' +
  'estimated_duration, intensity, priority, status, week_phase, rationale, structure';

export interface PlanContext {
  as_of: string;
  plan: Record<string, unknown> | null;       // the plan whose date range contains as_of
  upcoming_races: Record<string, unknown>[];   // race plans on/after as_of
  current_week: Record<string, unknown> | null;
  upcoming: Record<string, unknown>[];          // next UPCOMING_DAYS of sessions (editable)
  recent: RecentSession[];                       // last RECENT_DAYS planned vs actual
  wellness: Record<string, unknown> | null;
  zones: {
    threshold_pace: string | null;
    pace_zones: { name: string; pace_min: string; pace_max: string }[];
    hr: { threshold: number | null; max: number | null; resting: number | null };
    hr_zones: { name: string; hr_min: number; hr_max: number }[];
    ftp: number | null;
    power_zones: { name: string; power_min: number; power_max: number }[];
  };
  constraints: Record<string, unknown>[];
  coaching: Record<string, unknown> | null;     // autonomy + guardrails + standing notes
  recent_changes: Record<string, unknown>[];    // adjustment_logs tail (empty until the agent writes)
  reference: {                                   // static — how to author edits (no need to search the code)
    session_schemas: typeof SESSION_SCHEMAS;
    exercise_catalog: typeof EXERCISE_CATALOG;
  };
}

export interface RecentSession {
  id: string;
  scheduled_date: string;
  session_type: string;
  name: string;
  priority: string | null;
  status: string;
  adherence: 'done' | 'missed' | 'rest';
  planned: { distance_km: number | null; target_pace: string | null; estimated_tss: number | null; estimated_duration: string | null };
  actual: {
    distance_km: number | null; duration_mins: number | null; avg_pace_min_km: number | null;
    ngp_min_km: number | null; avg_hr: number | null; avg_power: number | null; source: string | null;
  } | null;
}

// Assemble the briefing as of `asOf` (YYYY-MM-DD; defaults to today, UTC).
export async function getPlanContext(asOf?: string): Promise<PlanContext> {
  const today = asOf ?? new Date().toISOString().slice(0, 10);
  const upcomingTo = addDays(today, UPCOMING_DAYS);
  const recentFrom = addDays(today, -RECENT_DAYS);
  const recentTo = addDays(today, -1);

  const [
    activePlan, upcomingRaces, currentWeek, upcoming, recent,
    wellness, threshold, paceZones, hrConfig, hrZones, powerConfig, powerZones,
    constraints, coaching, recentChanges,
  ] = await Promise.all([
    getActivePlan(today),
    getUpcomingRaces(today),
    getCurrentWeek(today),
    getUpcomingSessions(today, upcomingTo),
    getRecentSessions(recentFrom, recentTo),
    getWellnessCacheRow(),
    getThresholdPace(),
    listPaceZones(),
    getHrConfig(),
    listHrZones(),
    getPowerConfig(),
    listPowerZones(),
    listPlanConstraints(),
    getCoachingPrefs(),
    getRecentChanges(),
  ]);

  return {
    as_of: today,
    plan: activePlan,
    upcoming_races: upcomingRaces,
    current_week: currentWeek as Record<string, unknown> | null,
    upcoming,
    recent,
    wellness: wellness as Record<string, unknown> | null,
    zones: {
      threshold_pace: threshold,
      pace_zones: paceZones.map(z => ({ name: z.name, pace_min: z.pace_min, pace_max: z.pace_max })),
      hr: {
        threshold: hrConfig?.threshold_hr ?? null,
        max:       hrConfig?.max_hr ?? null,
        resting:   hrConfig?.resting_hr ?? null,
      },
      hr_zones: hrZones.map(z => ({ name: z.name, hr_min: z.hr_min, hr_max: z.hr_max })),
      ftp: powerConfig?.threshold_power ?? null,
      power_zones: powerZones.map(z => ({ name: z.name, power_min: z.power_min, power_max: z.power_max })),
    },
    constraints: constraints as Record<string, unknown>[],
    coaching: coaching as Record<string, unknown> | null,
    recent_changes: recentChanges,
    reference: { session_schemas: SESSION_SCHEMAS, exercise_catalog: EXERCISE_CATALOG },
  };
}

// ── focused reads ────────────────────────────────────────────

// The plan whose [start_date, end_date] contains `asOf` (first by sort_order).
async function getActivePlan(asOf: string): Promise<Record<string, unknown> | null> {
  const { data } = await supabaseAdmin
    .from('plans')
    .select('*')
    .lte('start_date', asOf)
    .gte('end_date', asOf)
    .order('sort_order')
    .limit(1)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

async function getUpcomingRaces(asOf: string): Promise<Record<string, unknown>[]> {
  const { data } = await supabaseAdmin
    .from('plans')
    .select('id, name, race_date, distance_km, target_time, target_pace, strength_priority')
    .eq('kind', 'race')
    .gte('race_date', asOf)
    .order('race_date');
  return (data ?? []) as Record<string, unknown>[];
}

async function getUpcomingSessions(from: string, to: string): Promise<Record<string, unknown>[]> {
  const { data } = await supabaseAdmin
    .from('plan_sessions')
    .select(SESSION_FIELDS)
    .gte('scheduled_date', from)
    .lte('scheduled_date', to)
    .order('scheduled_date')
    .order('am_pm');
  // SESSION_FIELDS is a string variable (not a literal), so supabase-js can't
  // infer the row type and widens to its error shape — cast through unknown.
  return (data ?? []) as unknown as Record<string, unknown>[];
}

// Planned sessions in [from, to] annotated with their actuals (from completed_workouts).
async function getRecentSessions(from: string, to: string): Promise<RecentSession[]> {
  const [{ data: sessions }, { data: completed }] = await Promise.all([
    supabaseAdmin
      .from('plan_sessions')
      .select('id, scheduled_date, session_type, name, priority, status, distance_km, target_pace, estimated_tss, estimated_duration')
      .gte('scheduled_date', from)
      .lte('scheduled_date', to)
      .order('scheduled_date'),
    supabaseAdmin
      .from('completed_workouts')
      .select('plan_session_id, actual_distance_km, actual_duration_mins, actual_avg_pace_min_km, actual_ngp_min_km, actual_avg_hr, actual_avg_power, source')
      .gte('completed_date', from)
      .lte('completed_date', to),
  ]);

  const bySession = new Map<string, NonNullable<typeof completed>[number]>();
  for (const c of completed ?? []) {
    if (c.plan_session_id) bySession.set(c.plan_session_id as string, c);
  }

  return (sessions ?? []).map(s => {
    const c = bySession.get(s.id as string);
    const isRest = (s.session_type as string) === 'REST';
    return {
      id: s.id as string,
      scheduled_date: s.scheduled_date as string,
      session_type: s.session_type as string,
      name: s.name as string,
      priority: (s.priority as string | null) ?? null,
      status: s.status as string,
      adherence: isRest ? 'rest' : c ? 'done' : 'missed',
      planned: {
        distance_km: s.distance_km != null ? Number(s.distance_km) : null,
        target_pace: (s.target_pace as string | null) ?? null,
        estimated_tss: (s.estimated_tss as number | null) ?? null,
        estimated_duration: (s.estimated_duration as string | null) ?? null,
      },
      actual: c ? {
        distance_km: c.actual_distance_km != null ? Number(c.actual_distance_km) : null,
        duration_mins: c.actual_duration_mins != null ? Number(c.actual_duration_mins) : null,
        avg_pace_min_km: c.actual_avg_pace_min_km != null ? Number(c.actual_avg_pace_min_km) : null,
        ngp_min_km: c.actual_ngp_min_km != null ? Number(c.actual_ngp_min_km) : null,
        avg_hr: (c.actual_avg_hr as number | null) ?? null,
        avg_power: (c.actual_avg_power as number | null) ?? null,
        source: (c.source as string | null) ?? null,
      } : null,
    };
  });
}

// The tail of the change log — what prior coaching passes already did, and why.
async function getRecentChanges(): Promise<Record<string, unknown>[]> {
  const { data } = await supabaseAdmin
    .from('adjustment_logs')
    .select('id, plan_session_id, chip_used, before_state, after_state, logged_at')
    .order('logged_at', { ascending: false })
    .limit(CHANGE_LOG_LIMIT);
  return (data ?? []) as Record<string, unknown>[];
}
