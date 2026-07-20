// The plan-agent briefing — one deterministic read a fresh coaching session loads
// to understand the current state before reviewing or changing the plan. Assembles
// the plan, the near-term schedule (the editable surface), recent adherence,
// wellness, the zones used to set targets, and the coaching inputs (constraints +
// autonomy + the recent change log). See docs/plan-agent.md for the contract.
//
// This is a READ. It never mutates. Mutations go through the (forthcoming) logged
// adjustment path so every change is auditable and reversible.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentUserId } from '@/lib/scope';
import { todayISO } from '@/lib/dates';
import {
  resolveZone, zoneFromPace, normalizeStructure, paceToSeconds, secondsToPace,
  type ZoneMap, type PaceZone,
} from '@/lib/plan-structure';
import { getCurrentWeek } from '@/data/plans';
import { getWellnessCacheRow } from '@/data/wellness-cache';
import { listPlanConstraints, getCoachingPrefs } from '@/data/coaching';
import { listAvailabilityFrom, getAvailabilityReviewState, describeAvailabilityRow, type AvailabilityRow } from '@/data/availability';
import { detectAvailabilityConflicts, type AvailabilityConflict, type ConflictSession } from '@/lib/availability-conflicts';
import {
  getThresholdPace, listPaceZones, getHrConfig, listHrZones,
  getPowerConfig, listPowerZones,
} from '@/data/zones';
import { STRENGTH_EXERCISES } from '@/data/strength-exercises';
import { getStrengthCoachSummary } from '@/data/strength-progression';
import { listActiveNiggles } from '@/data/strength-niggles';
import { getPendingThresholdSuggestion } from '@/data/threshold-suggestion';
import { getFuelPlanForGoalBlock } from '@/data/fuel-plan';
import { resolveFuelGuidance, NORMAL_FUEL_KIND, type FuelGuidance, type FuelOverride } from '@/lib/fuel-progression';

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
  cycling: {
    field: 'structure (jsonb array of phases/repeats) — the session\'s activity_type must be "cycling"',
    phase: { type: "'phase'", label: 'string, e.g. "Threshold"', zone: "string 'Z1'..'Z5' (optional)", power_pct_ftp: 'number = %FTP, e.g. 110 (optional; overrides zone). Use power_pct_min/power_pct_max for a band', duration_mins: 'number' },
    repeat: { type: "'repeat'", count: 'number', steps: '[phase, ...] — usually a work phase + a recovery phase' },
    note: 'Cycling is power + duration. Target power by ZONE or an explicit %FTP (110 = 110% of FTP; re-derives if FTP changes). Recovery is just a lower phase inside a repeat — there is no separate rest flag. e.g. "10min @60%, then 4×(5min @110% + 3min @90%)".',
    example: [
      { type: 'phase', label: 'Warm-up', duration_mins: 10, power_pct_ftp: 60 },
      { type: 'repeat', count: 4, steps: [
        { type: 'phase', label: 'Threshold', duration_mins: 5, power_pct_ftp: 110 },
        { type: 'phase', label: 'Recovery', duration_mins: 3, power_pct_ftp: 90 },
      ] },
    ],
  },
  swim: {
    field: 'structure (jsonb array of phases/repeats) — the session\'s activity_type must be "swimming"',
    phase: { type: "'phase'", label: 'string, e.g. "Drills" | "Aerobic"', zone: "string 'Z1'..'Z5' (swim pace zone)", distance_m: 'number metres', rest_sec: 'number seconds rest after this rep (optional)' },
    repeat: { type: "'repeat'", count: 'number', steps: '[phase, ...]' },
    note: 'Swim is distance + pace-per-100m by zone (its own swim_pace_zones). Rest between reps via rest_sec. Pool swims push to the watch; name/describe an open-water swim as such to keep it off the watch. e.g. "5×100m drills 30s rest, then 4×100m Z2 60s rest".',
    example: [
      { type: 'repeat', count: 5, steps: [{ type: 'phase', label: 'Drills', zone: 'Z1', distance_m: 100, rest_sec: 30 }] },
      { type: 'repeat', count: 4, steps: [{ type: 'phase', label: 'Aerobic', zone: 'Z2', distance_m: 100, rest_sec: 60 }] },
    ],
  },
  strength: {
    field: 'structure (jsonb array of exercises)',
    exercise: { name: 'string', sets: 'number', reps: 'number', reps_type: "'reps' | 'secs'", weight: 'number kg | null (bodyweight/band)', target: 'string, e.g. "Chest"', exercise_id: 'number — REQUIRED, from reference.exercise_catalog' },
    note: 'CORE sessions use the same shape as STRENGTH. exercise_id is REQUIRED and MUST be a real id from reference.exercise_catalog (match by name, then set both name and exercise_id) — an exercise without a catalog id will not prompt for difficulty or progress. Do not invent ids or leave it null.',
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

// min/km → "m:ss" for the coach briefing.
function fmtPaceMinKm(minKm: number): string {
  const m = Math.floor(minKm), s = Math.round((minKm - m) * 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
}

// Planning fields the agent reasons over / may change. `id` is the address for a
// later change; `structure` is the per-segment prescription.
const SESSION_FIELDS =
  'id, plan_id, scheduled_date, day_of_week, am_pm, session_type, activity_type, ' +
  'name, description, distance_km, target_pace, target_pace_end, estimated_tss, ' +
  'estimated_duration, intensity, priority, status, week_phase, rationale, structure, fuel_override';

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
  availability: (AvailabilityRow & { summary: string })[]; // all upcoming restrictions the user recorded (not clipped to the 14-day session window); `summary` states the direction (items are BARRED, not allowed)
  availability_conflicts: AvailabilityConflict[]; // precomputed clashes between availability and the plan
  availability_review: {                         // the "changed since I last looked?" gate
    content_updated_at: string; last_reviewed_at: string | null; changed_since_review: boolean;
  };
  coaching: Record<string, unknown> | null;     // autonomy + guardrails + standing notes
  recent_changes: Record<string, unknown>[];    // adjustment_logs tail (empty until the agent writes)
  strength: {                                    // how the strength builder is progressing + adapting
    active_niggles: Record<string, unknown>[];
    summary: Record<string, unknown>;
  };
  threshold_suggestion: {                        // a pending threshold auto-suggestion, if any (read-only for the coach)
    current: string; suggested: string; commentary: string;
  } | null;
  rpe_overreach: {                               // an easy run that felt disproportionately hard — early fatigue signal
    date: string; session: string; session_type: string; rpe: number; note: string;
  } | null;
  fuel_guidance: {                               // today's gut-training fuel guidance (goal-block sessions)
    session: string; kind: string; gph: number | null; label: string;
  } | null;
  log_nudge: string | null;                      // ONE consolidated "please log X" line for the evening review
  reference: {                                   // static — how to author edits (no need to search the code)
    session_schemas: typeof SESSION_SCHEMAS;
    exercise_catalog: typeof EXERCISE_CATALOG;
  };
}

// A deterministic "did the run stay in its prescribed zone?" verdict, computed so
// the coach never has to infer zone adherence from the session's name or HR — and
// never mis-reads a decimal min/km (5.28) as clock time (5:28). Paces are already
// formatted "m:ss/km". Also carries the effort read (avg HR + its HR zone) so the
// coach weighs effort = HR × pace, not pace alone, and can spot decoupling.
// Signed per-phase pacing miss for a structured run: how far each planned phase's
// actual pace ran from its target. This is the single number that makes a pacing
// deviation against plan structurally un-overlookable (Phase 2b).
export interface PlanDeviation {
  phase: string;        // the phase label, e.g. "First 50km"
  planned: string;      // planned target, "m:ss/km" (or a range)
  actual: string;       // actual segment pace, "m:ss/km"
  dev_sec_km: number;   // signed s/km: + = slower than target, − = faster
}

export interface PaceCheck {
  planned_zone: string;          // e.g. "Z2 Aerobic Endurance", or "mixed (Z2 + Z1)"
  planned_window: string | null; // e.g. "4:10–4:54/km" (null for mixed workouts)
  actual_pace: string;           // e.g. "5:17/km"
  actual_ngp: string | null;     // grade-adjusted, when available
  actual_zone: string | null;    // the zone the actual pace fell in
  actual_hr: number | null;      // avg HR (bpm), the effort signal
  actual_hr_zone: string | null; // the HR zone that HR fell in, e.g. "Z1 Recovery"
  elevation_gain_m: number | null; // total climb (metres) — the terrain signal
  effort_note: string | null;    // decoupling read when HR effort and pace diverge
  plan_deviation: PlanDeviation[] | null; // per-phase actual-vs-target (structured runs)
  verdict: string;               // plain-language on-plan / OUTSIDE-plan judgement
}

export interface RecentSession {
  id: string;
  scheduled_date: string;
  session_type: string;
  name: string;
  priority: string | null;
  status: string;
  adherence: 'done' | 'missed' | 'rest';
  // The plan's stated intent — injected only for the sessions where grading the day
  // against the hypothesis matters (an A-priority / race session, or one whose
  // structure prescribes distinct phases). "Where a plan states a hypothesis, the
  // review must grade the day against it." Absent (undefined) on routine sessions.
  rationale?: string | null;
  planned: {
    distance_km: number | null; target_pace: string | null; estimated_tss: number | null; estimated_duration: string | null;
    // The prescribed phases (pace/distance per phase) for a multi-phase / race
    // session, so the review compares phase-by-phase instead of against a whole-run
    // average. Present only on the same qualifying sessions as `rationale`.
    structure?: unknown;
  };
  actual: {
    distance_km: number | null; duration_mins: number | null; avg_pace_min_km: number | null;
    ngp_min_km: number | null; avg_hr: number | null; avg_power: number | null;
    elevation_gain_m: number | null;
    decoupling_pct: number | null;   // aerobic decoupling (cardiac drift); >0 = worse
    pace_decay_pct: number | null;   // final-third pace vs first two-thirds; >0 = faded, <0 = negative split
    durability: string | null;       // interpreted long-run durability read (long runs only)
    // Per-phase actual pace ("m:ss/km") and avg HR, aligned to planned.structure, when
    // the sync stored per-segment splits. Lets the review read each phase's actual
    // against its planned target rather than only the whole-run average.
    segment_paces?: (string | null)[] | null;
    segment_hr?: (number | null)[] | null;
    // The stored split profile (Phase 2) — quartile pace/GAP, first-20% vs target,
    // stopped time, split outliers. Present when the sync has computed it for the run.
    split_profile?: unknown;
    rpe: number | null; fuel_g_per_h: number | null; source: string | null;
    // When the athlete stitched two+ Strava activities into this one session, the
    // individual activities that make it up (primary first). Null for a normal
    // single-activity completion. The `actual.*` fields above are the COMBINED
    // totals; NGP is dropped on a merge, so TSS/pace here are average-pace based.
    merged_from: { name: string | null; distance_km: number | null; duration_mins: number | null; avg_pace_min_km: number | null; avg_hr: number | null }[] | null;
  } | null;
  pace_check: PaceCheck | null;   // pace-vs-prescribed-zone verdict for completed runs
  fuel_override?: FuelOverride | null; // raw per-session override (for resolution)
  fuel_guidance?: FuelGuidance;   // resolved fuelling directive — always set on output
}

// Assemble the briefing as of `asOf` (YYYY-MM-DD; defaults to today, UTC).
//
// `throughToday` moves the recent/upcoming boundary so TODAY counts as recent
// (done, with its actuals) rather than upcoming. The evening review runs at ~9pm
// when today's session is finished, so it must see today's result — without this
// a race/workout done today lands in `upcoming` with no completion attached and
// the coach reports it as "not synced yet". The default (false) keeps today in
// `upcoming` for the mid-day plan agent, where a not-yet-done session shouldn't
// read as missed.
export async function getPlanContext(asOf?: string, opts?: { throughToday?: boolean }): Promise<PlanContext> {
  const today = asOf ?? todayISO();
  const throughToday = opts?.throughToday ?? false;
  const upcomingTo = addDays(today, UPCOMING_DAYS);
  const upcomingFrom = throughToday ? addDays(today, 1) : today;
  const recentFrom = addDays(today, -RECENT_DAYS);
  const recentTo = throughToday ? today : addDays(today, -1);

  // Pace + HR zones drive the per-run pace/effort check in the `recent` list, so
  // resolve them (cached reads) before the main wave and reuse the rows for
  // zones.pace_zones / zones.hr_zones.
  const [paceZones, hrZones] = await Promise.all([listPaceZones(), listHrZones()]);
  const runZones = buildRunZoneMap(paceZones);
  const runHrBands = buildHrBands(hrZones);

  const [
    activePlan, upcomingRaces, currentWeek, upcoming, recent,
    wellness, threshold, hrConfig, powerConfig, powerZones,
    constraints, availability, availabilityReview, coaching, recentChanges,
    strengthSummary, activeNiggles, thresholdSuggestion, fuelMap,
  ] = await Promise.all([
    getActivePlan(today),
    getUpcomingRaces(today),
    getCurrentWeek(today),
    getUpcomingSessions(upcomingFrom, upcomingTo),
    getRecentSessions(recentFrom, recentTo, runZones, runHrBands),
    getWellnessCacheRow(),
    getThresholdPace(),
    getHrConfig(),
    getPowerConfig(),
    listPowerZones(),
    listPlanConstraints(),
    listAvailabilityFrom(upcomingFrom),
    getAvailabilityReviewState(),
    getCoachingPrefs(),
    getRecentChanges(),
    getStrengthCoachSummary(),
    listActiveNiggles(),
    getPendingThresholdSuggestion(),
    getFuelPlanForGoalBlock(today),
  ]);

  // Deterministic availability↔plan conflicts. `upcoming` covers the 14-day edit
  // window; availability can reach further out, so when it does, fetch the plan
  // sessions spanning to the latest restriction (only then) so a clash on a far day
  // is still detected. Within 14 days we reuse `upcoming` — no extra query.
  const latestAvailability = availability.reduce((m, r) => (r.date > m ? r.date : m), upcomingTo);
  const conflictSource = latestAvailability > upcomingTo
    ? await getUpcomingSessions(upcomingFrom, latestAvailability)
    : upcoming;
  const conflictSessions: ConflictSession[] = conflictSource.map(s => ({
    scheduled_date:     s.scheduled_date as string,
    name:               s.name as string,
    session_type:       s.session_type as string,
    activity_type:      (s.activity_type as string | null) ?? null,
    intensity:          (s.intensity as string | null) ?? null,
    priority:           (s.priority as string | null) ?? null,
    estimated_duration: (s.estimated_duration as string | null) ?? null,
    distance_km:        s.distance_km != null ? Number(s.distance_km) : null,
  }));
  const availabilityConflicts = detectAvailabilityConflicts(availability, conflictSessions);
  const availabilityChanged =
    !availabilityReview.last_reviewed_at ||
    availabilityReview.content_updated_at > availabilityReview.last_reviewed_at;

  // Today's gut-training fuel guidance (for the morning briefing's session line) —
  // the first of today's sessions that carries a target. Today lives in `upcoming`
  // for the mid-day agent and in `recent` for the evening review.
  // Resolved (override-aware) so it matches the per-session fuel_guidance below for
  // the same date — the first of today's sessions carrying a non-normal directive.
  const todaysAll: { id: string; name: string; override: FuelOverride | null }[] = [
    ...upcoming.filter(s => (s.scheduled_date as string) === today).map(s => ({ id: s.id as string, name: s.name as string, override: (s.fuel_override as FuelOverride | null) ?? null })),
    ...recent.filter(s => s.scheduled_date === today).map(s => ({ id: s.id, name: s.name, override: s.fuel_override ?? null })),
  ];
  let fuelGuidance: PlanContext['fuel_guidance'] = null;
  for (const s of todaysAll) {
    const g = resolveFuelGuidance(s.override, fuelMap.get(s.id));
    if (g.kind !== NORMAL_FUEL_KIND) { fuelGuidance = { session: s.name, kind: g.kind, gph: g.gph, label: g.label }; break; }
  }

  // ONE consolidated evening log-nudge: unlogged fuel on today's gut-training rep
  // and/or an unrated non-run session. Never more than one line.
  const nudges: string[] = [];
  if (throughToday) {
    for (const s of recent) {
      if (s.scheduled_date !== today || s.adherence !== 'done') continue;
      const t = fuelMap.get(s.id);
      if (t?.kind === 'progression' && s.actual?.fuel_g_per_h == null) {
        nudges.push(`log what you fuelled on ${s.name} (target was ${t.gph} g/h)`);
      }
      const nonRun = ['STRENGTH', 'CORE', 'YOGA'].includes(s.session_type);
      if (nonRun && s.actual?.rpe == null) nudges.push(`rate the effort on ${s.name}`);
    }
  }
  const logNudge = nudges.length ? nudges.join(' and ') : null;

  return {
    as_of: today,
    plan: activePlan,
    upcoming_races: upcomingRaces,
    current_week: currentWeek as Record<string, unknown> | null,
    // Each run carries its prescribed `target` — paired pace + HR from the same zone,
    // so a reader never mixes (e.g.) a Z2 pace with a Z1 HR on an unstructured easy run.
    // Every session also carries an explicit `fuel_guidance` (never omitted): the
    // resolved fuelling directive for that session, override-aware and matching the
    // top-level fuel_guidance for the same date.
    upcoming: upcoming.map(s => ({
      ...s,
      target: runTargets(s, runZones, runHrBands),
      fuel_guidance: resolveFuelGuidance((s.fuel_override as FuelOverride | null) ?? null, fuelMap.get(s.id as string)),
    })),
    recent: recent.map(s => ({ ...s, fuel_guidance: resolveFuelGuidance(s.fuel_override ?? null, fuelMap.get(s.id)) })),
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
    availability: availability.map(r => ({ ...r, summary: describeAvailabilityRow(r) })),
    availability_conflicts: availabilityConflicts,
    availability_review: {
      content_updated_at: availabilityReview.content_updated_at,
      last_reviewed_at:   availabilityReview.last_reviewed_at,
      changed_since_review: availabilityChanged,
    },
    coaching: coaching as Record<string, unknown> | null,
    recent_changes: recentChanges,
    strength: {
      active_niggles: activeNiggles as unknown as Record<string, unknown>[],
      summary: strengthSummary as unknown as Record<string, unknown>,
    },
    threshold_suggestion: thresholdSuggestion && thresholdSuggestion.suggested_min_km != null
      ? { current: fmtPaceMinKm(thresholdSuggestion.current_min_km), suggested: fmtPaceMinKm(thresholdSuggestion.suggested_min_km), commentary: thresholdSuggestion.commentary }
      : null,
    rpe_overreach: detectRpeOverreach(recent),
    fuel_guidance: fuelGuidance,
    log_nudge: logNudge,
    reference: { session_schemas: SESSION_SCHEMAS, exercise_catalog: EXERCISE_CATALOG },
  };
}

// Earliest overreach signal: a run that was meant to be easy but felt
// disproportionately hard by RPE (1–10). Quality sessions are meant to feel hard,
// so they don't count; long runs get a higher bar than recovery/easy. Returns the
// most recent flagged run, or null. RPE for runs comes from Garmin — dormant until
// that data flows.
function detectRpeOverreach(recent: RecentSession[]): PlanContext['rpe_overreach'] {
  const flag = (s: RecentSession): boolean => {
    if (s.adherence !== 'done' || s.actual?.rpe == null) return false;
    const rpe = s.actual.rpe, t = s.session_type;
    if (t === 'REC' || t === 'GA') return rpe >= 7;     // easy → shouldn't feel hard
    if (t === 'MLR' || t === 'LR') return rpe >= 8;     // long → moderate is fine; flag only if very hard
    return false;                                        // VO2 / LT / MP / RACE are meant to be hard
  };
  const hit = recent.filter(flag).sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date))[0];
  if (!hit || hit.actual?.rpe == null) return null;
  return {
    date: hit.scheduled_date, session: hit.name, session_type: hit.session_type, rpe: hit.actual.rpe,
    note: `${hit.name} (${hit.session_type}, an easy session) came back at RPE ${hit.actual.rpe}/10 — disproportionately hard, an early sign of accumulated fatigue.`,
  };
}

// ── focused reads ────────────────────────────────────────────

// The plan whose [start_date, end_date] contains `asOf` (first by sort_order).
async function getActivePlan(asOf: string): Promise<Record<string, unknown> | null> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('plans')
    .select('*')
    .eq('user_id', userId)
    .lte('start_date', asOf)
    .gte('end_date', asOf)
    .order('sort_order')
    .limit(1)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

async function getUpcomingRaces(asOf: string): Promise<Record<string, unknown>[]> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('plans')
    .select('id, name, race_date, distance_km, target_time, target_pace, strength_priority')
    .eq('user_id', userId)
    .eq('kind', 'race')
    .gte('race_date', asOf)
    .order('race_date');
  return (data ?? []) as Record<string, unknown>[];
}

async function getUpcomingSessions(from: string, to: string): Promise<Record<string, unknown>[]> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('plan_sessions')
    .select(SESSION_FIELDS)
    .eq('user_id', userId)
    .gte('scheduled_date', from)
    .lte('scheduled_date', to)
    .order('scheduled_date')
    .order('am_pm');
  // SESSION_FIELDS is a string variable (not a literal), so supabase-js can't
  // infer the row type and widens to its error shape — cast through unknown.
  return (data ?? []) as unknown as Record<string, unknown>[];
}

// A ZoneMap (keyed Z1..Zn) from the raw pace_zones rows — the shape
// normalizeStructure / zoneFromPace consume. Local mini-builder so the briefing
// doesn't need to fetch all four zone tables just to check run paces.
function buildRunZoneMap(rows: readonly Record<string, unknown>[]): ZoneMap {
  const m: ZoneMap = {};
  for (const z of rows) {
    const key = z.zone_key as string;
    if (!key) continue;
    m[key] = { key, name: z.name as string, paceMin: z.pace_min as string, paceMax: z.pace_max as string, sortOrder: z.sort_order as number };
  }
  return m;
}

// Run HR zones as ordered bands, for classifying an avg HR into an effort zone.
interface HrBand { key: string; name: string; min: number; max: number; sortOrder: number }
function buildHrBands(rows: readonly Record<string, unknown>[]): HrBand[] {
  return rows
    .map(z => ({ key: z.zone_key as string, name: z.name as string, min: Number(z.hr_min), max: Number(z.hr_max), sortOrder: Number(z.sort_order) }))
    .filter(b => b.key)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

// The HR zone a bpm value falls in; the nearest band when it's outside every window.
function hrZoneFromBpm(bpm: number, bands: HrBand[]): HrBand | null {
  if (!bands.length) return null;
  for (const b of bands) if (bpm >= b.min && bpm <= b.max) return b;
  let best = bands[0], bestDist = Infinity;
  for (const b of bands) {
    const dist = bpm < b.min ? b.min - bpm : bpm > b.max ? bpm - b.max : 0;
    if (dist < bestDist) { bestDist = dist; best = b; }
  }
  return best;
}

// Long-run durability read — the key endurance signal for the ultra. Only
// meaningful on longer efforts (the long-run session types, or anything ≥15 km):
// on a short easy run cardiac drift and a final-third split are noise, so we
// don't editorialise them. decouplingPct > 0 = HR drifted up for the same effort
// (worse); paceDecayPct > 0 = faded in the last third, < 0 = negative split.
const LONG_RUN_TYPES = ['LR', 'MLR'];
function durabilityNote(sessionType: string, distanceKm: number | null, decouplingPct: number | null, paceDecayPct: number | null): string | null {
  const isLong = LONG_RUN_TYPES.includes(sessionType) || (distanceKm != null && distanceKm >= 15);
  if (!isLong) return null;
  if (decouplingPct == null && paceDecayPct == null) return null;
  const parts: string[] = [];
  if (decouplingPct != null) {
    const q = decouplingPct <= 5 ? 'strong aerobic durability'
      : decouplingPct <= 10 ? 'moderate cardiac drift'
      : 'high aerobic decoupling — fatigue, heat, or under-fuelling';
    parts.push(`HR-pace decoupling ${decouplingPct.toFixed(1)}% (${q})`);
  }
  if (paceDecayPct != null) {
    const q = paceDecayPct <= 0 ? 'held or negative-split the finish'
      : paceDecayPct <= 5 ? 'minor final-third fade'
      : 'notable final-third fade';
    parts.push(`final-third pace ${paceDecayPct > 0 ? '+' : ''}${paceDecayPct.toFixed(1)}% (${q})`);
  }
  return parts.join('; ');
}

const NON_RUN_TYPES = ['STRENGTH', 'CORE', 'YOGA', 'REST'];

// Distinct pace-zone keys a structured run spans (empty when unstructured).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function structureZoneKeys(structure: any, zones: ZoneMap): string[] {
  const steps = normalizeStructure(Array.isArray(structure) ? structure : null, zones);
  const keys = new Set<string>();
  for (const st of steps) {
    if (st.kind === 'segment') { if (st.zoneKey) keys.add(st.zoneKey); }
    else for (const sub of st.steps) if (sub.zoneKey) keys.add(sub.zoneKey);
  }
  return [...keys];
}

// Session intensity → the zone it prescribes (mirrors the UI's INTENSITY map).
const INTENSITY_ZONE: Record<string, string> = {
  easy: 'Z2', recovery: 'Z1', steady: 'Z3', tempo: 'Z4', hard: 'Z5', race: 'Z5',
};

// The prescribed pace AND HR window(s) for a planned run, BOTH drawn from the same
// zone so a briefing reader can't pair (say) a Z2 pace with a Z1 HR ceiling. An
// unstructured run (no `structure`) resolves one zone from its intensity, falling
// back to the zone its target_pace lands in; a structured run lists each distinct
// segment zone. Returns null for non-runs (zones don't apply to strength/yoga/rides).
function runTargets(
  session: Record<string, unknown>,
  runZones: ZoneMap,
  hrBands: HrBand[],
): { zone: string; pace: string | null; hr: string | null }[] | null {
  const activityType = session.activity_type as string | null;
  const sessionType = session.session_type as string | null;
  const isRun = (activityType === 'running' || activityType == null)
    && (sessionType == null || !NON_RUN_TYPES.includes(sessionType));
  if (!isRun) return null;

  let keys = structureZoneKeys(session.structure, runZones);
  if (!keys.length) {
    const intensity = session.intensity as string | null;
    const fromIntensity = intensity ? INTENSITY_ZONE[intensity] : null;
    const fromPace = zoneFromPace(session.target_pace as string | null, runZones)?.key ?? null;
    const k = fromIntensity ?? fromPace;
    if (k) keys = [k];
  }
  if (!keys.length) return null;

  keys.sort((a, b) => (runZones[a]?.sortOrder ?? 0) - (runZones[b]?.sortOrder ?? 0));
  return keys.map(key => {
    const pz = runZones[key];
    const hz = hrBands.find(b => b.key === key);
    const name = pz?.name ?? hz?.name;
    return {
      zone: name ? `${key} ${name}` : key,
      pace: pz?.paceMin && pz?.paceMax ? `${pz.paceMin}–${pz.paceMax}/km` : null,
      hr: hz ? `${hz.min}–${hz.max} bpm` : null,
    };
  });
}

// The single prescribed zone for an easy/steady run: the zone token in its
// description/name ("Z2", "ultra", …), else the zone containing the authored
// target pace. Null when there's no zone signal at all.
function plannedRunZone(name: string, description: string | null, targetPace: string | null, zones: ZoneMap): PaceZone | null {
  return resolveZone(`${description ?? ''} ${name ?? ''}`, targetPace, zones);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "2026-07-08" → "8 Jul", so a quoted pace_check verdict carries its own date and
// the coach can't mis-pair a pace with the wrong day.
function fmtShortDate(iso: string): string {
  const m = Number(iso.slice(5, 7)), d = Number(iso.slice(8, 10));
  return m >= 1 && m <= 12 && d ? `${d} ${MONTHS[m - 1]}` : iso;
}

// Signed per-phase pacing miss: each planned phase's target pace vs its actual
// segment pace. Only a simple (no-repeat) phase list aligns 1:1 with segment_actuals,
// so repeats/mismatched lengths return null (the raw structure + segment_paces are
// still in the payload). + s/km = slower than target, − = faster.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computePlanDeviation(structure: any, segmentActuals: (number | null)[] | null): PlanDeviation[] | null {
  if (!Array.isArray(structure) || !Array.isArray(segmentActuals)) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (structure.some((p: any) => p?.type === 'repeat' || Array.isArray(p?.steps))) return null;
  if (structure.length !== segmentActuals.length) return null;
  const out: PlanDeviation[] = [];
  for (let i = 0; i < structure.length; i++) {
    const p = structure[i] ?? {};
    const actualSec = segmentActuals[i];
    if (actualSec == null) continue;
    const pMin = paceToSeconds((p.pace_per_km ?? p.pace_min ?? null) as string | null);
    const pMax = paceToSeconds((p.pace_max ?? p.pace_per_km ?? p.pace_min ?? null) as string | null) ?? pMin;
    if (pMin == null || pMax == null) continue;
    const plannedMid = (pMin + pMax) / 2;
    const planned = p.pace_min && p.pace_max && p.pace_min !== p.pace_max
      ? `${p.pace_min}–${p.pace_max}/km`
      : `${secondsToPace(Math.round(plannedMid))}/km`;
    out.push({
      phase: (p.label ?? p.phase ?? `Phase ${i + 1}`) as string,
      planned,
      actual: `${secondsToPace(Math.round(actualSec))}/km`,
      dev_sec_km: Math.round(actualSec - plannedMid),
    });
  }
  return out.length ? out : null;
}

// Deterministic pace-vs-prescribed-zone verdict for a completed run. Returns null
// for non-runs, sessions without an actual pace, or runs with no zone to check
// against (so the coach falls back to the raw actuals, as before). The verdict is
// prefixed with the session's date so the coach quotes pace + date as one fact.
function buildPaceCheck(
  s: { scheduled_date: string; session_type: string; activity_type: string | null; name: string; description: string | null; target_pace: string | null; structure: unknown },
  actualPaceMinKm: number | null, ngpMinKm: number | null, actualHr: number | null,
  elevationGainM: number | null, distanceKm: number | null,
  segmentActuals: (number | null)[] | null,
  zones: ZoneMap, hrBands: HrBand[],
): PaceCheck | null {
  if (NON_RUN_TYPES.includes(s.session_type) || s.activity_type === 'cycling' || s.activity_type === 'swimming') return null;
  if (actualPaceMinKm == null) return null;

  const dateLabel = fmtShortDate(s.scheduled_date);
  const planDeviation = computePlanDeviation(s.structure, segmentActuals);

  const rawSec = Math.round(actualPaceMinKm * 60);
  const ngpSec = ngpMinKm != null ? Math.round(ngpMinKm * 60) : null;
  // Judge zone/effort by grade-adjusted pace (NGP) when we have it: a hilly run
  // comes in slow on the watch, but NGP is the effort-honest pace and the fair
  // basis for "did you run the right zone". A big raw-vs-NGP gap, or a lot of
  // climb per km, marks the run as hilly; NGP is what actually corrects the pace.
  const effortSec = ngpSec ?? rawSec;
  const mPerKm = elevationGainM != null && distanceKm ? elevationGainM / distanceKm : null;
  const hilly = (ngpSec != null && Math.abs(rawSec - ngpSec) >= 8) || (mPerKm != null && mPerKm >= 10);
  // Human-readable terrain tag, e.g. "116 m climb (14 m/km)".
  const elevTag = elevationGainM != null
    ? `${elevationGainM} m climb${mPerKm != null ? ` (${Math.round(mPerKm)} m/km)` : ''}`
    : 'hilly';
  const actualPace = `${secondsToPace(rawSec)}/km`;
  const actualNgp = ngpSec != null ? `${secondsToPace(ngpSec)}/km` : null;
  const actualZone = zoneFromPace(secondsToPace(effortSec), zones);
  const actualZoneLabel = actualZone ? `${actualZone.key} ${actualZone.name}` : null;

  // Effort read: which HR zone the average HR fell in. Effort = HR × pace, so this
  // is what tells the coach whether an easy-looking pace actually came easy.
  const hrZone = actualHr != null ? hrZoneFromBpm(actualHr, hrBands) : null;
  const actualHrZoneLabel = hrZone ? `${hrZone.key} ${hrZone.name}` : null;

  // Decoupling read: HR effort vs the effort the actual pace implies.
  let effortNote: string | null = null;
  if (actualZone && hrZone) {
    const gap = hrZone.sortOrder - actualZone.sortOrder;
    if (gap >= 2) effortNote = 'HR effort well above the running pace — likely fatigue, heat, or hills';
    else if (gap === 1) effortNote = 'HR effort a touch above the running pace';
    else if (gap <= -1) effortNote = 'HR below the effort the pace implies — it came comfortably';
  }

  // Multi-zone structured workout: no single whole-run verdict — flag it so the
  // coach reads it per segment rather than judging the average.
  const structureKeys = s.structure ? structureZoneKeys(s.structure, zones) : [];
  if (structureKeys.length > 1) {
    return {
      planned_zone: `mixed (${structureKeys.join(' + ')})`,
      planned_window: null,
      actual_pace: actualPace,
      actual_ngp: actualNgp,
      actual_zone: actualZoneLabel,
      actual_hr: actualHr,
      actual_hr_zone: actualHrZoneLabel,
      elevation_gain_m: elevationGainM,
      effort_note: null, // whole-run average is a blend across zones — decoupling read isn't meaningful
      plan_deviation: planDeviation,
      verdict: `${dateLabel}: structured multi-zone session — assess each segment against its own target, not the whole-run average (actual_pace ${actualPace} is a blend, NOT an easy-run pace)${hilly ? ` — ${elevTag}` : ''}`,
    };
  }

  const planned = structureKeys.length === 1
    ? (zones[structureKeys[0]] ?? null)
    : plannedRunZone(s.name, s.description, s.target_pace, zones);
  if (!planned) return null;

  const a = paceToSeconds(planned.paceMin) ?? 0, b = paceToSeconds(planned.paceMax) ?? 0;
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const plannedLabel = `${planned.key} ${planned.name}`;
  const plannedWindow = `${planned.paceMin}–${planned.paceMax}/km`;
  // On hills the effort-honest pace is NGP; show both, with the climb, so the coach sees why.
  const paceShown = hilly && actualNgp ? `${actualNgp} grade-adjusted (raw ${actualPace} — ${elevTag})` : actualPace;

  let verdict: string;
  if (effortSec >= lo && effortSec <= hi) {
    verdict = `on plan — ran in the prescribed ${plannedLabel} (${plannedWindow})${hilly && actualNgp ? `, on grade-adjusted pace ${actualNgp} (raw ${actualPace} — ${elevTag})` : ''}`;
  } else {
    const easier = effortSec > hi; // a slower pace is an easier effort
    const gap = actualZone ? Math.abs(actualZone.sortOrder - planned.sortOrder) : 0;
    const mag = gap >= 2 ? `${gap} zones ${easier ? 'easier' : 'harder'}`
      : gap === 1 ? `a full zone ${easier ? 'easier' : 'harder'}`
      : easier ? 'slower' : 'faster';
    verdict = `OUTSIDE plan — ran ${mag} than prescribed: target ${plannedLabel} (${plannedWindow}), actual ${paceShown}${actualZoneLabel ? ` = ${actualZoneLabel}` : ''}`;
  }
  verdict = `${dateLabel}: ${verdict}`;

  return {
    planned_zone: plannedLabel, planned_window: plannedWindow,
    actual_pace: actualPace, actual_ngp: actualNgp, actual_zone: actualZoneLabel,
    actual_hr: actualHr, actual_hr_zone: actualHrZoneLabel, elevation_gain_m: elevationGainM,
    effort_note: effortNote, plan_deviation: planDeviation, verdict,
  };
}

// Planned sessions in [from, to] annotated with their actuals (from completed_workouts).
async function getRecentSessions(from: string, to: string, zones: ZoneMap, hrBands: HrBand[]): Promise<RecentSession[]> {
  const userId = await currentUserId();
  const { data: sessions } = await supabaseAdmin
    .from('plan_sessions')
    .select('id, scheduled_date, session_type, activity_type, name, description, intensity, priority, status, distance_km, target_pace, estimated_tss, estimated_duration, rationale, structure, fuel_override')
    .eq('user_id', userId)
    .gte('scheduled_date', from)
    .lte('scheduled_date', to)
    .order('scheduled_date');

  // Fetch completions by plan_session_id, NOT by completed_date window: a session
  // done a day late (or synced across a date boundary) has its completion outside
  // [from, to] and would be misreported as "missed" to the coach.
  const ids = (sessions ?? []).map(s => s.id as string);
  const completedRes = ids.length
    ? await supabaseAdmin
        .from('completed_workouts')
        .select('plan_session_id, strava_activity_id, merged_strava_ids, actual_distance_km, actual_duration_mins, actual_elapsed_secs, actual_avg_pace_min_km, actual_ngp_min_km, actual_avg_hr, actual_avg_power, actual_elevation_gain_m, decoupling_pct, pace_decay_pct, segment_actuals, segment_hr, split_profile, perceived_effort, fuel_carbs_per_h, source')
        .eq('user_id', userId)
        .in('plan_session_id', ids)
    : null;
  const completed = completedRes?.data ?? [];

  const bySession = new Map<string, (typeof completed)[number]>();
  for (const c of completed ?? []) {
    if (c.plan_session_id) bySession.set(c.plan_session_id as string, c);
  }

  // For any completion stitched from several Strava activities, fetch the
  // constituent activities so the coach sees the separate runs (and the fact of
  // the merge), not just the combined totals. One batched read for all of them.
  const mergedIdsBySession = new Map<string, number[]>();  // plan_session_id → [primary, ...merged]
  const allActivityIds = new Set<number>();
  for (const c of completed ?? []) {
    const merged = ((c.merged_strava_ids as number[] | null) ?? []).map(Number).filter(Boolean);
    if (!merged.length || !c.plan_session_id) continue;
    const ordered = [...(c.strava_activity_id != null ? [Number(c.strava_activity_id)] : []), ...merged];
    mergedIdsBySession.set(c.plan_session_id as string, ordered);
    ordered.forEach(id => allActivityIds.add(id));
  }
  const activityById = new Map<number, { name: string | null; distance_km: number | null; duration_mins: number | null; avg_pace_min_km: number | null; avg_hr: number | null }>();
  if (allActivityIds.size) {
    const { data: acts } = await supabaseAdmin
      .from('activities')
      .select('strava_activity_id, name, distance_km, duration_mins, avg_pace_min_km, avg_hr')
      .eq('user_id', userId)
      .in('strava_activity_id', [...allActivityIds]);
    for (const a of acts ?? []) {
      activityById.set(Number(a.strava_activity_id), {
        name: (a.name as string | null) ?? null,
        distance_km: a.distance_km != null ? Number(a.distance_km) : null,
        duration_mins: a.duration_mins != null ? Number(a.duration_mins) : null,
        avg_pace_min_km: a.avg_pace_min_km != null ? Number(a.avg_pace_min_km) : null,
        avg_hr: a.avg_hr != null ? Number(a.avg_hr) : null,
      });
    }
  }

  return (sessions ?? []).map(s => {
    const c = bySession.get(s.id as string);
    const isRest = (s.session_type as string) === 'REST';
    const actualPaceMinKm = c && c.actual_avg_pace_min_km != null ? Number(c.actual_avg_pace_min_km) : null;
    const ngpMinKm = c && c.actual_ngp_min_km != null ? Number(c.actual_ngp_min_km) : null;
    const avgHr = c && c.actual_avg_hr != null ? Number(c.actual_avg_hr) : null;
    const elevGainM = c && c.actual_elevation_gain_m != null ? Number(c.actual_elevation_gain_m) : null;
    const distanceKm = c && c.actual_distance_km != null ? Number(c.actual_distance_km) : null;
    const decouplingPct = c && c.decoupling_pct != null ? Number(c.decoupling_pct) : null;
    const paceDecayPct = c && c.pace_decay_pct != null ? Number(c.pace_decay_pct) : null;
    // Per-phase actuals (s/km, aligned to the planned structure) → "m:ss/km" strings.
    const segmentActuals = c ? ((c.segment_actuals as (number | null)[] | null) ?? null) : null;
    const segmentHr = c ? ((c.segment_hr as (number | null)[] | null) ?? null) : null;
    const splitProfile = c ? ((c.split_profile as unknown) ?? null) : null;
    const segmentPaces = Array.isArray(segmentActuals)
      ? segmentActuals.map(v => (v != null ? `${secondsToPace(Math.round(v))}/km` : null))
      : null;
    // Sessions where the plan states a hypothesis worth grading against: an
    // A-priority / race session, or a run whose structure prescribes distinct phases.
    const isRunSession = ((s.activity_type as string | null) === 'running' || s.activity_type == null)
      && !NON_RUN_TYPES.includes(s.session_type as string);
    const qualifying = s.priority === 'A' || s.intensity === 'race'
      || (isRunSession && Array.isArray(s.structure) && (s.structure as unknown[]).length > 1);
    return {
      id: s.id as string,
      scheduled_date: s.scheduled_date as string,
      session_type: s.session_type as string,
      name: s.name as string,
      priority: (s.priority as string | null) ?? null,
      status: s.status as string,
      adherence: isRest ? 'rest' : c ? 'done' : 'missed',
      ...(qualifying ? { rationale: (s.rationale as string | null) ?? null } : {}),
      planned: {
        distance_km: s.distance_km != null ? Number(s.distance_km) : null,
        target_pace: (s.target_pace as string | null) ?? null,
        estimated_tss: (s.estimated_tss as number | null) ?? null,
        estimated_duration: (s.estimated_duration as string | null) ?? null,
        ...(qualifying && Array.isArray(s.structure) ? { structure: s.structure } : {}),
      },
      actual: c ? {
        distance_km: c.actual_distance_km != null ? Number(c.actual_distance_km) : null,
        // A race's duration is its elapsed finish (moving time undercounts it); other
        // sessions report moving time. split_profile.stopped_secs still exposes stops.
        duration_mins: (s.session_type === 'RACE' && c.actual_elapsed_secs != null)
          ? Number(c.actual_elapsed_secs) / 60
          : (c.actual_duration_mins != null ? Number(c.actual_duration_mins) : null),
        avg_pace_min_km: actualPaceMinKm,
        ngp_min_km: ngpMinKm,
        avg_hr: (c.actual_avg_hr as number | null) ?? null,
        avg_power: (c.actual_avg_power as number | null) ?? null,
        elevation_gain_m: elevGainM,
        decoupling_pct: decouplingPct,
        pace_decay_pct: paceDecayPct,
        durability: durabilityNote(s.session_type as string, distanceKm, decouplingPct, paceDecayPct),
        ...(segmentPaces ? { segment_paces: segmentPaces, segment_hr: segmentHr } : {}),
        ...(splitProfile ? { split_profile: splitProfile } : {}),
        rpe: c.perceived_effort != null ? Number(c.perceived_effort) : null,
        fuel_g_per_h: c.fuel_carbs_per_h != null ? Number(c.fuel_carbs_per_h) : null,
        source: (c.source as string | null) ?? null,
        merged_from: (() => {
          const idsForSession = mergedIdsBySession.get(s.id as string);
          if (!idsForSession) return null;
          const parts = idsForSession.map(id => activityById.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
          return parts.length ? parts : null;
        })(),
      } : null,
      pace_check: c ? buildPaceCheck(
        {
          scheduled_date: s.scheduled_date as string,
          session_type: s.session_type as string,
          activity_type: (s.activity_type as string | null) ?? null,
          name: s.name as string,
          description: (s.description as string | null) ?? null,
          target_pace: (s.target_pace as string | null) ?? null,
          structure: s.structure,
        },
        actualPaceMinKm, ngpMinKm, avgHr, elevGainM, distanceKm, segmentActuals, zones, hrBands,
      ) : null,
      fuel_override: (s.fuel_override as FuelOverride | null) ?? null,
    };
  });
}

// The tail of the change log — what prior coaching passes already did, and why.
// Selects actor/operation/reason (the agent-era columns); chip_used is legacy and
// always null for agent-made changes, so it carried no "why".
async function getRecentChanges(): Promise<Record<string, unknown>[]> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('adjustment_logs')
    .select('id, plan_session_id, actor, operation, reason, before_state, after_state, logged_at')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false })
    .limit(CHANGE_LOG_LIMIT);
  return (data ?? []) as Record<string, unknown>[];
}
