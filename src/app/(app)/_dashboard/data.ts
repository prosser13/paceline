// Shared dashboard data loader — all the queries and derivations the dashboard
// (src/app/page.tsx) and its sub-components need, in one place.

import { cache } from 'react';
import { getViewedUser } from '@/lib/impersonation';
import { getCurrentUser } from '@/lib/auth';
import { getPendingThresholdSuggestion, type ThresholdCheck } from '@/data/threshold-suggestion';
import { getPendingPowerSuggestion, type PowerCheck } from '@/data/power-suggestion';
import { getBmrKcal, getActivityFactor, getLatestBodyweightKg } from '@/data/hydration';
import { dailyCalorieTarget, type CalorieTarget } from '@/lib/energy';
import { getWellnessCached } from '@/lib/intervals';
import {
  getCurrentWeek, getNextRace, getPlanStrengthPriority, listPlanPhaseWeeks, getUpcomingPlan,
} from '@/data/plans';
import { getThresholdPace, listPaceZones, listHrZones, listPowerZones, listBikeHrZones, listSwimPaceZones } from '@/data/zones';
import {
  listSessionsBetween, listSessionDistancesBetween, listCompletedBetween, listSportLoadBetween,
  listCompletedForSessions, listCompletedDistancesBetween, getMostRecentCompletedSession,
  listCompletedTssBetween, listRunningDoneSince, listRecentRaces,
} from '@/data/plan-sessions';
import { standouts, type Standout, type StandoutRace } from '@/lib/wellness-stats';
import { getRaceGuide } from '@/data/races';
import { listOffPlanActivitiesBetween, type OffPlanActivity } from '@/data/activities';
import { getVisibleCoachMessages, type CoachMessage } from '@/data/coach';
import { getDailyNote } from '@/data/daily-notes';
import { getLatestWellnessDay, listRecentWellnessDays } from '@/data/wellness-days';
import { activityKind } from '@/lib/activity-types';
import { resolveSport, sportSpec } from '@/lib/sports/registry';
import { weekRunKm, countsToWeeklyVolume } from '@/lib/weekly-volume';
import { intraDayOrder, strengthFirstOrder } from '@/lib/session-order';
import { buildZoneMaps } from '@/lib/zone-builders';
import { buildCompletedActuals, parseThresholdPace, type CompletedActuals } from '@/lib/completed';
import { sessionTss } from '@/lib/run-tss';
import { todayISO, appHour } from '@/lib/dates';
import { getFuelPlanForGoalBlock } from '@/data/fuel-plan';
import { listFuelProducts, type FuelProduct } from '@/data/fuel';
import type { ZoneMap, HrZoneMap } from '@/lib/plan-structure';
import type { PowerZoneMap, BikeHrZoneMap } from '@/lib/cycling';
import type { SwimPaceZoneMap } from '@/lib/swim';
import type { PhaseSeg, WeekDay } from '@/components/dashboard-graphics';

export interface PlanSession {
  id: string;
  scheduled_date: string;
  session_type?: string | null;
  activity_type?: string | null;
  name: string;
  description?: string | null;
  distance_km?: number | null;
  target_pace?: string | null;
  target_pace_end?: string | null;
  estimated_tss?: number | null;
  estimated_duration?: string | null;
  rationale?: string | null;
  status?: string | null;
  intensity?: string | null;
  profile_shape?: string | null;
  structure?: Array<{ phase: string; description: string; pace_per_km?: string; duration_mins?: number }> | null;
  fuel_target?: import('@/lib/fuel-progression').FuelTarget | null;   // gut-training guidance (goal block)
}

// Canonical completion shape lives in @/lib/completed; kept as a named alias so
// the dashboard's consumers (SessionHero etc.) keep importing CompletedToday.
export type CompletedToday = CompletedActuals;

export interface WindowDay {
  iso: string;
  short: string;        // "Thu"
  dateLabel: string;    // "26 Jun"
  isToday: boolean;
  isTomorrow: boolean;
  sessions: PlanSession[]; // run/race first, strength after
  volumeKm: number;
  hasRun: boolean;
  hasRide: boolean;
  hasSwim: boolean;
  hasStrength: boolean;
  hasYoga: boolean;
}

export interface DashboardData {
  firstName: string;
  greeting: string;
  todayFull: string;
  todayStr: string;

  todaySession: PlanSession | null;
  tomorrowSession: PlanSession | null;
  tomorrowStrength: PlanSession | null;
  todaySessions: PlanSession[];   // all of today's non-rest sessions, in display order
  todayDoneIds: string[];         // ids of today's sessions with a logged completion
  todayCompleted: CompletedToday | null;               // headline session's completion
  todayCompletedById: Record<string, CompletedToday>;  // per run/ride session (each hero renders its own)
  strengthFirst: boolean;

  upcomingWithRest: PlanSession[]; // days +2..+7, rest-filled
  windowDays: WindowDay[];         // today..+6 (7 entries)

  zones: ZoneMap;
  hrZones: HrZoneMap;
  powerZones: PowerZoneMap;
  bikeHrZones: BikeHrZoneMap;
  swimZones: SwimPaceZoneMap;
  thresholdPace: string;

  hasPlanWeek: boolean;
  // Shown in place of "No active training block" when nothing is active but a block
  // is scheduled ahead (e.g. "Swansea Bay 10K · Starts Mon 13 Jul · in 2 days").
  upcomingBlock: { name: string; startDateStr: string; daysToStart: number } | null;
  weekLabel: string;
  weekPurpose: string | null;
  weekNumber: number | null;   // current week number within the plan
  weeksTotal: number | null;   // total weeks in the plan (for "week 5 of 7")
  weekPhase: string | null;    // current phase name (Base/Build/Peak/Taper)

  phaseSegments: PhaseSeg[];
  todayPct: number | null;
  ringPct: number;

  daysToRace: number | null;
  raceName: string | null;
  raceDateStr: string | null;
  raceTargetTime: string | null;
  raceDistanceKm: number | null;   // goal race distance, from its /races/<slug> guide

  // Next-race card: nearest upcoming RACE session (incl. tune-ups), with its A/B/C priority.
  nextRace: { name: string; daysTo: number | null; dateStr: string | null; priority: string | null; km: number | null; raceDateISO: string | null; raceSlug: string | null } | null;

  weekPlannedKm: number | null;
  weekDoneKm: number;
  weekToGoKm: number;
  weekDays: WeekDay[];

  last7: {
    totalKm: number; sessions: number; h: number; m: number; totalTss: number;
    loadSplit: { run: number; ride: number; other: number } | null;
  };

  offPlanToday: OffPlanActivity[];   // extras done today (shown under the Today node)
  offPlanRecent: OffPlanActivity[];  // extras in the last 7 days (excl. today)

  // Recently completed — latest finished run/ride before today, rendered by the
  // same hero as Today. `recentLabel` is the dated header e.g. "Thu 25 Jun · Done".
  recentSession: PlanSession | null;
  recentCompleted: CompletedToday | null;
  recentLabel: string | null;
  fuelProducts: FuelProduct[];   // fuel catalog for the inline long-run fuel log

  coachMessages: { morning: CoachMessage | null; evening: CoachMessage | null };  // latest of each kind
  dailyNote: string;                   // today's athlete note (for tonight's review)

  // Pending update-prompts (threshold pace / bike FTP), surfaced as the dashboard's
  // "Action needed" card. Null unless there's a pending suggestion AND the current
  // viewer can act on it (owner, not a read-only guest/impersonation) — the Apply/
  // Dismiss actions are owner-only, so hiding the card for non-writers avoids a
  // button that would just error.
  pendingThreshold: ThresholdCheck | null;
  pendingPower: PowerCheck | null;

  // Daily calorie target (maintenance base + planned exercise) for the Today tile.
  calorieTarget: CalorieTarget;
  // Whether the current viewer can act (owner, not a read-only guest/impersonation).
  // Reused by the suggestions card and the Today tile's "set base rate" prompt.
  canEdit: boolean;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}
function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  // Format from LOCAL components — d is local midnight, so isoDate()'s UTC
  // conversion would shift back a day in any positive-offset timezone (e.g. BST),
  // dropping the final day of the week.
  while (d <= end) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}
function greet(): string {
  const h = appHour();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
function fmtShort(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' });
}
function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function fmtWeekdayDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

// Long-weekday + date label for the agenda spine (e.g. "Thursday" / "26 Jun").
export function formatSpineDay(iso: string): { weekday: string; date: string } {
  const dt = new Date(iso + 'T00:00:00');
  return {
    weekday: dt.toLocaleDateString('en-GB', { weekday: 'long' }),
    date:    dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
  };
}

export async function loadDashboardData(): Promise<DashboardData> {
  const todayStr    = todayISO();
  const today       = new Date(todayStr + 'T00:00:00');
  const tomorrowStr = isoDate(addDays(today, 1));
  const weekAgoStr  = isoDate(addDays(today, -7));
  const weekEndStr  = isoDate(addDays(today, 7));
  const todayFull   = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  // ── Tier 1 ──
  const [
    user,
    windowSessions,
    recent,
    thresholdPaceRaw,
    paceZones,
    hrZoneRows,
    powerZoneRows,
    bikeHrZoneRows,
    swimZoneRows,
    weekRow,
    raceRow,
    offPlanRaw,
    recentCompletedRaw,
    coachMessages,
    dailyNote,
    sportLoad,
    fuelMap,
    fuelProducts,
    writerUser,
    pendingThresholdRaw,
    pendingPowerRaw,
    bmrKcal,
    activityFactor,
    bodyweightKg,
  ] = await Promise.all([
    getViewedUser(),
    listSessionsBetween(todayStr, weekEndStr),
    listCompletedBetween(weekAgoStr, todayStr),
    getThresholdPace(),
    listPaceZones(),
    listHrZones(),
    listPowerZones(),
    listBikeHrZones(),
    listSwimPaceZones(),
    getCurrentWeek(todayStr),
    getNextRace(todayStr),
    listOffPlanActivitiesBetween(weekAgoStr, todayStr),
    getMostRecentCompletedSession(todayStr),
    getVisibleCoachMessages(),
    getDailyNote(todayStr),
    listSportLoadBetween(weekAgoStr, todayStr),
    getFuelPlanForGoalBlock(todayStr),
    listFuelProducts(),
    getCurrentUser(),   // the write gate — null for a read-only guest / while impersonating
    getPendingThresholdSuggestion(),
    getPendingPowerSuggestion(),
    getBmrKcal(),
    getActivityFactor(),
    getLatestBodyweightKg(),
  ]);
  // Only surface owner-only affordances (Apply/Dismiss, "set base rate") to a viewer
  // who can actually write. Same gate as the write path (getCurrentUser()).
  const canEdit = !!writerUser;
  const pendingThreshold = canEdit ? pendingThresholdRaw : null;
  const pendingPower = canEdit ? pendingPowerRaw : null;
  // Attach gut-training fuel guidance to any goal-block session in the window.
  for (const s of (windowSessions ?? []) as PlanSession[]) {
    const t = fuelMap.get(s.id);
    if (t) s.fuel_target = t;
  }

  const firstName = (user?.user_metadata?.full_name as string | undefined)?.split(' ')[0] ?? '';

  // Group the window into a date → sessions map (run/race first, strength after).
  const all = (windowSessions ?? []) as PlanSession[];
  const byDate = new Map<string, PlanSession[]>();
  for (const s of all) {
    const list = byDate.get(s.scheduled_date) ?? [];
    list.push(s);
    byDate.set(s.scheduled_date, list);
  }
  const planId = (weekRow?.plan_id as number | null) ?? null;

  // Same-day ordering: strength leads on strength-priority plans (Dragon 50),
  // otherwise the run/ride leads. The flag only decides intra-day *display
  // order*, and today's session *set* is order-independent — so the flag, the
  // per-session completions, the weekly distance rollups and the phase weeks all
  // resolve in ONE parallel wave (was: await the flag on its own, then a separate
  // Tier 2 — two serial transatlantic round-trips, now collapsed into one).
  const todayListRaw = (byDate.get(todayStr) ?? []).filter(s => s.status !== 'rest');
  const [strengthFirst, todayCompletions, weekData, planWeeks] = await Promise.all([
    planId ? getPlanStrengthPriority(planId) : Promise.resolve(false),
    listCompletedForSessions(todayListRaw.map(s => s.id)),
    weekRow?.date_from && weekRow?.date_to
      ? Promise.all([
          listSessionDistancesBetween(weekRow.date_from, weekRow.date_to),
          listCompletedDistancesBetween(weekRow.date_from, weekRow.date_to),
        ])
      : Promise.resolve(null),
    planId ? listPlanPhaseWeeks(planId) : Promise.resolve([]),
  ]);
  // id → completion, so the lookups below survive the in-place sort that follows.
  const completionById = new Map(todayCompletions.map(c => [c.plan_session_id as string, c]));

  // Display order within a day: the sequence sessions are actually done in
  // (warm-up → run → stretch → core → strength), or strength-first on
  // strength-priority plans. STRENGTH and CORE share a tier.
  const isStrengthTier = (s: PlanSession) => sportSpec(s).isStrengthTier;
  for (const list of byDate.values()) {
    list.sort((a, b) =>
      strengthFirst
        ? strengthFirstOrder(a) - strengthFirstOrder(b)
        : intraDayOrder(a) - intraDayOrder(b));
  }
  // The day's primary cardio session (run/ride) feeds the hero + "next up". A RACE
  // is the day's headline, but on a race day its warm-up run sorts *before* it
  // (intraDayOrder: warm-up 30, race 35), so taking the first main session would
  // lock the hero onto the warm-up — the race would never become today's session
  // and so never show as done. Prefer the race when one is planned that day.
  function pickRun(list?: PlanSession[]): PlanSession | null {
    const mains = list?.filter(s => sportSpec(s).isMain);
    return mains?.find(s => s.session_type === 'RACE') ?? mains?.[0] ?? null;
  }
  function pickStrength(list?: PlanSession[]): PlanSession | null {
    return list?.find(isStrengthTier) ?? null;
  }

  // Today's sessions in display order — the single source of truth for the
  // dashboard's Today node, kept identical to the plan by the same sort above.
  const todaySessions    = (byDate.get(todayStr) ?? []).filter(s => s.status !== 'rest');
  const todaySession     = pickRun(byDate.get(todayStr));
  const tomorrowSession  = pickRun(byDate.get(tomorrowStr));
  const tomorrowStrength = pickStrength(byDate.get(tomorrowStr));

  const thresholdPace = thresholdPaceRaw ?? '3:40';
  const threshMinKm   = parseThresholdPace(thresholdPace);

  const { zones, hrZones, powerZones, bikeHrZones, swimZones, ftp } = buildZoneMaps({
    paceZones, hrZones: hrZoneRows, powerZones: powerZoneRows, bikeHrZones: bikeHrZoneRows, swimZones: swimZoneRows,
  });

  // Off-plan extras: run TSS from pace, then split today vs recent (newest-first
  // already from the query).
  for (const a of offPlanRaw) {
    if (activityKind(a.activityType) !== 'run') continue;
    const tss = sessionTss({ mins: a.durationMins, runPace: a.avgPaceMinKm ?? null, power: null }, threshMinKm, null);
    if (tss != null) a.tss = tss;
  }
  const offPlanToday  = offPlanRaw.filter(a => a.date === todayStr);
  const offPlanRecent = offPlanRaw.filter(a => a.date !== todayStr);

  // Upcoming (+2..+7), rest-filled
  const upcomingWithRest: PlanSession[] = [];
  for (let i = 2; i <= 7; i++) {
    const date = isoDate(addDays(today, i));
    const daySessions = byDate.get(date);
    if (daySessions?.length) upcomingWithRest.push(...daySessions);
    else upcomingWithRest.push({ id: `rest-${date}`, scheduled_date: date, name: 'Rest', status: 'rest' } as PlanSession);
  }

  // Window (today..+6) for week-strip / calendar layouts
  const windowDays: WindowDay[] = [];
  for (let i = 0; i <= 6; i++) {
    const iso = isoDate(addDays(today, i));
    const sessions = byDate.get(iso) ?? [];
    const volumeKm = sessions.reduce((s, x) => s + (Number(x.distance_km) || 0), 0);
    windowDays.push({
      iso,
      short: fmtShort(iso),
      dateLabel: fmtDate(iso),
      isToday: i === 0,
      isTomorrow: i === 1,
      sessions,
      volumeKm,
      hasRun: sessions.some(s => resolveSport(s) === 'run'),
      hasRide: sessions.some(s => resolveSport(s) === 'cycling'),
      hasSwim: sessions.some(s => resolveSport(s) === 'swimming'),
      hasStrength: sessions.some(s => resolveSport(s) === 'strength'),
      hasYoga: sessions.some(s => resolveSport(s) === 'yoga'),
    });
  }

  // Last 7 days stats
  const totalKm   = recent?.reduce((s, w) => s + (w.actual_distance_km ?? 0), 0) ?? 0;
  const totalMins = recent?.reduce((s, w) => s + (w.actual_duration_mins ?? 0), 0) ?? 0;
  const sessions  = recent?.length ?? 0;
  const h = Math.floor(totalMins / 60);
  const m = Math.round(totalMins % 60);
  // Prefer the stored, never-stale tss column (recomputed on every sync/threshold
  // change — the canonical value, and the only one that counts rides). Fall back to
  // a live pace-derived rTSS only for a row that has no stored value yet (runs only).
  const totalTss = Math.round((recent ?? []).reduce((s, w) => {
    if (w.tss != null) return s + Number(w.tss);
    const mins = w.actual_duration_mins ? Number(w.actual_duration_mins) : null;
    const runPace = w.actual_ngp_min_km != null ? Number(w.actual_ngp_min_km)
      : w.actual_avg_pace_min_km ? Number(w.actual_avg_pace_min_km) : null;
    if (mins == null || runPace == null || runPace <= 0) return s;
    const IF = threshMinKm / runPace;
    return s + (mins / 60) * IF * IF * 100;
  }, 0));

  // Run-load share (trailing 7 days): stored TSS split by sport, shown as a plain
  // indicator. Percentages come from the split, so absolute totals need not match
  // the pace-derived "Load" stat.
  let loadRun = 0, loadRide = 0, loadOther = 0;
  for (const w of sportLoad ?? []) {
    const tss = w.tss != null ? Number(w.tss) : 0;
    if (!(tss > 0)) continue;
    const ps = (Array.isArray(w.plan_sessions) ? w.plan_sessions[0] : w.plan_sessions) as
      { session_type: string | null; activity_type: string | null } | null;
    const sport = resolveSport(ps ?? {});
    if (sport === 'run') loadRun += tss;
    else if (sport === 'cycling') loadRide += tss;
    else loadOther += tss;
  }
  const loadSplit = (loadRun + loadRide + loadOther) > 0
    ? { run: Math.round(loadRun), ride: Math.round(loadRide), other: Math.round(loadOther) }
    : null;

  const weekLabel   = weekRow ? `${weekRow.phase} · Week ${weekRow.week_number}` : 'This week';
  const weekPurpose = (weekRow?.purpose as string | null) ?? null;

  // No active block today → surface the next scheduled one ("Starts Mon 13 Jul")
  // instead of a bare "No active training block". Only queried on that path.
  let upcomingBlock: DashboardData['upcomingBlock'] = null;
  if (!weekRow) {
    const up = await getUpcomingPlan(todayStr);
    if (up?.start_date) {
      const t = new Date(); t.setHours(0, 0, 0, 0);
      const daysToStart = Math.ceil((new Date(up.start_date + 'T00:00:00').getTime() - t.getTime()) / 86400000);
      upcomingBlock = { name: up.name, startDateStr: fmtWeekdayDate(up.start_date), daysToStart };
    }
  }

  let daysToRace: number | null = null;
  if (raceRow?.race_date) {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    daysToRace = Math.ceil((new Date(raceRow.race_date + 'T00:00:00').getTime() - t.getTime()) / 86400000);
  }
  const raceName = (raceRow?.name as string | null) ?? null;
  const raceDateStr = raceRow?.race_date ? fmtWeekdayDate(raceRow.race_date) : null;
  // Goal race distance comes from its curated /races/<slug> guide (not the plan row).
  const raceDistanceKm = raceRow?.slug ? (getRaceGuide(raceRow.slug)?.distanceKm ?? null) : null;

  // Next-race card — the nearest upcoming RACE session in the window (e.g. a
  // tune-up), with its A/B/C priority; falls back to the goal race if none.
  const raceSessions = (all as Array<PlanSession & { priority?: string | null }>)
    .filter(s => s.session_type === 'RACE' && s.scheduled_date >= todayStr)
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  const nrs = raceSessions[0] ?? null;
  let nextRace: DashboardData['nextRace'] = null;
  if (nrs) {
    nextRace = {
      name: nrs.name,
      daysTo: Math.ceil((new Date(nrs.scheduled_date + 'T00:00:00').getTime() - new Date(todayStr + 'T00:00:00').getTime()) / 86400000),
      dateStr: fmtWeekdayDate(nrs.scheduled_date),
      priority: nrs.priority ?? null,
      km: nrs.distance_km ?? null,
      raceDateISO: nrs.scheduled_date,
      // The goal-race guide (e.g. dragon-50) has a location but no hard-coded date,
      // so pass its slug when this session IS the goal race (same date). Tune-ups
      // with dated guides resolve by date instead (raceSlug null).
      raceSlug: raceRow?.race_date && raceRow.race_date === nrs.scheduled_date ? (raceRow.slug ?? null) : null,
    };
  } else if (raceName) {
    nextRace = { name: raceName, daysTo: daysToRace, dateStr: raceDateStr, priority: null, km: null, raceDateISO: raceRow?.race_date ?? null, raceSlug: raceRow?.slug ?? null };
  }

  // Per-session completion: which of today's sessions are logged, plus each
  // run/ride's rich completion (drives its hero's pace/HR breakdown). A race day
  // completes several main sessions (warm-up + race) and each hero renders its
  // OWN completion, so build one per session — not just for the headline
  // todaySession, which would leave every other done run looking unfinished.
  const todayDoneIds = todaySessions.filter(s => completionById.get(s.id)).map(s => s.id);
  const todayCompletedById: Record<string, CompletedToday> = {};
  for (const s of todaySessions) {
    // ALL sessions, not just the main run/ride — strength/yoga heroes need their
    // completion for the manual RPE scale (7B).
    const row = completionById.get(s.id);
    if (row) todayCompletedById[s.id] = buildCompletedActuals(row, threshMinKm, ftp);
  }
  const todayCompleted: CompletedToday | null =
    todaySession ? todayCompletedById[todaySession.id] ?? null : null;

  // Recently completed — the latest finished run/ride before today. Rendered by
  // the SAME hero as Today (one card to maintain), with a dated "· Done" label.
  let recentSession: PlanSession | null = null;
  let recentCompleted: CompletedToday | null = null;
  let recentLabel: string | null = null;
  if (recentCompletedRaw) {
    const { cw: rcw, ps } = recentCompletedRaw;
    recentSession = ps as unknown as PlanSession;
    const rt = fuelMap.get(recentSession.id);
    if (rt) recentSession.fuel_target = rt;
    recentCompleted = buildCompletedActuals(rcw, threshMinKm, ftp);
    const dateLabel = new Date(rcw.completed_date + 'T00:00:00')
      .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    recentLabel = `${dateLabel} · Done`;
  }

  let weekPlannedKm: number | null = null;
  let weekDoneKm = 0;
  let weekToGoKm = 0;
  let weekDays: WeekDay[] = [];
  if (weekData && weekRow?.date_from && weekRow?.date_to) {
    const [weekSessions, weekCompleted] = weekData;
    // "Running volume" = RUNS only. Rides carry distance_km too, so summing every
    // session double-counts cycling and the number looks wrong — filter to
    // run/run-race sessions (same predicate as the done side below).
    const runSessions = (weekSessions ?? []).filter(countsToWeeklyVolume);
    weekPlannedKm = weekRunKm(weekSessions ?? []);

    const plannedByDate = new Map<string, number>();
    const raceKmByDate = new Map<string, number>();
    for (const s of runSessions) {
      plannedByDate.set(s.scheduled_date, (plannedByDate.get(s.scheduled_date) ?? 0) + (Number(s.distance_km) || 0));
      // Race days get their distance flagged so the bar splits.
      if (s.session_type === 'RACE') {
        raceKmByDate.set(s.scheduled_date, (raceKmByDate.get(s.scheduled_date) ?? 0) + (Number(s.distance_km) || 0));
      }
    }
    // "This week" tracks RUNNING volume only — exclude rides and
    // strength/core/yoga completions so a logged ride doesn't inflate the km.
    const isRunCompletion = (c: { plan_sessions?: unknown }) => {
      const ps = Array.isArray(c.plan_sessions) ? c.plan_sessions[0] : c.plan_sessions;
      if (!ps) return true; // off-plan completion — assume a run
      return countsToWeeklyVolume(ps as { session_type?: string | null; activity_type?: string | null });
    };
    const doneByDate = new Map<string, number>();
    for (const c of weekCompleted ?? []) {
      if (!c.completed_date || !isRunCompletion(c)) continue;
      const km = Number(c.actual_distance_km) || 0;
      doneByDate.set(c.completed_date, (doneByDate.get(c.completed_date) ?? 0) + km);
      if (c.completed_date <= todayStr) weekDoneKm += km;
    }

    weekDays = eachDate(weekRow.date_from, weekRow.date_to).map(date => {
      const dd = new Date(date + 'T00:00:00');
      const label = ['M', 'T', 'W', 'T', 'F', 'S', 'S'][(dd.getDay() + 6) % 7];
      const done = doneByDate.get(date) ?? 0;
      const planned = plannedByDate.get(date) ?? 0;
      let state: WeekDay['state'];
      let km: number;
      if (date === todayStr) { state = 'today'; km = done > 0 ? done : planned; }
      else if (done > 0 && date < todayStr) { state = 'done'; km = done; }
      else if (planned > 0) { state = 'plan'; km = planned; }
      else { state = 'rest'; km = 0; }
      const raceKm = raceKmByDate.get(date) ?? 0;
      return { label, km, state, ...(raceKm > 0 && km > 0 ? { raceKm } : {}) };
    });

    // "To go" = planned run km still ahead — today (if unfinished) + future days.
    // Measured per-day so over-running a done day can't eat into what's left:
    // running 43 of a planned 37 today still leaves tomorrow's full 19 to go.
    weekToGoKm = Math.round(eachDate(weekRow.date_from, weekRow.date_to).reduce((s, date) => {
      if (date < todayStr) return s;
      const planned = plannedByDate.get(date) ?? 0;
      const done = doneByDate.get(date) ?? 0;
      return s + Math.max(0, planned - done);
    }, 0));
  }

  // Phase timeline
  const phaseSegments: PhaseSeg[] = [];
  let todayPct: number | null = null;
  let ringPct = 0;
  {
    const wks = (planWeeks ?? []) as { phase: string; date_from: string; date_to: string; week_number: number }[];
    const pStart = wks[0]?.date_from ?? null;
    const pEnd   = wks[wks.length - 1]?.date_to ?? null;
    if (pStart && pEnd) {
      const totalMs = new Date(pEnd + 'T00:00:00').getTime() - new Date(pStart + 'T00:00:00').getTime() + 86400000;
      for (const w of wks) {
        const wMs = new Date(w.date_to + 'T00:00:00').getTime() - new Date(w.date_from + 'T00:00:00').getTime() + 86400000;
        const pct = (wMs / totalMs) * 100;
        const last = phaseSegments[phaseSegments.length - 1];
        if (last?.phase === w.phase) last.pct += pct;
        else phaseSegments.push({ phase: w.phase, pct });
      }
      todayPct = Math.max(0, Math.min(100,
        ((new Date(todayStr + 'T00:00:00').getTime() - new Date(pStart + 'T00:00:00').getTime()) / totalMs) * 100,
      ));
      ringPct = 100 - todayPct;
    }
  }

  // Daily calorie target — maintenance base (BMR × activity factor) + today's
  // exercise. Uses each session's LOGGED actuals once it's completed (so running
  // longer/shorter than planned moves the number), falling back to the plan for
  // sessions not yet done. Pure compute over already-loaded data + latest weight.
  const calorieSessions = todaySessions.map(s => {
    const c = todayCompletedById[s.id];
    return c ? { ...s, actualDurationMins: c.mins, actualDistanceKm: c.distanceKm } : s;
  });
  const calorieTarget = dailyCalorieTarget({
    bmr: bmrKcal,
    activityFactor,
    weightKg: bodyweightKg,
    sessions: calorieSessions,
  });

  return {
    firstName, greeting: greet(), todayFull, todayStr,
    todaySession, tomorrowSession, tomorrowStrength, todaySessions, todayDoneIds, todayCompleted, todayCompletedById,
    strengthFirst,
    upcomingWithRest, windowDays,
    zones, hrZones, powerZones, bikeHrZones, swimZones, thresholdPace,
    hasPlanWeek: !!weekRow,
    upcomingBlock,
    weekLabel, weekPurpose,
    weekNumber: (weekRow?.week_number as number | null) ?? null,
    weeksTotal: (planWeeks?.length as number | undefined) ?? null,
    weekPhase: (weekRow?.phase as string | null) ?? null,
    phaseSegments, todayPct, ringPct,
    daysToRace, raceName, raceDateStr, raceTargetTime: (raceRow?.target_time as string | null) ?? null, raceDistanceKm, nextRace,
    weekPlannedKm, weekDoneKm, weekToGoKm, weekDays,
    last7: { totalKm, sessions, h, m, totalTss, loadSplit },
    offPlanToday, offPlanRecent,
    recentSession, recentCompleted, recentLabel,
    fuelProducts,
    coachMessages,
    dailyNote,
    pendingThreshold, pendingPower,
    calorieTarget, canEdit,
  };
}

// Wellness (fitness/fatigue/form) is loaded separately from the main dashboard
// data because it depends on the external intervals.icu API (a cross-region
// fetch on the first load of each day). Keeping it out of loadDashboardData()
// means the slow call can't block the agenda/week/today content — it streams
// into its own <Suspense> boundary instead. cache() collapses the two consumers
// (FormMeter + FitnessChart) to a single fetch per request.
export const loadWellness = cache(async () => {
  const w = await getWellnessCached();
  return { fitnessForm: w.form, fitnessHistory: w.history };
});

// Daily biometric history (sleep, HRV, resting HR, VO2max…) from `wellness_days`
// — the source for the wellness tiles. A fast Supabase read (no external API), so
// unlike loadWellness it needn't be isolated behind its own Suspense; cache()
// shares the one read across every wellness tile in a request.
export const loadWellnessDays = cache(async () => {
  const [latest, recent] = await Promise.all([getLatestWellnessDay(), listRecentWellnessDays(30)]);
  return { latest, recent };
});

// Monday (ISO week start) of a yyyy-mm-dd date.
function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoDate(d);
}
function paceToSec(p: string | null): number | null {
  if (!p) return null;
  const [m, s] = p.split(':').map(Number);
  return Number.isFinite(m) && Number.isFinite(s) ? m * 60 + s : null;
}

// Computed Standout[] for the wellness tile + banner — wellness biometrics plus
// weekly running-volume and recent race results. cache() shares the reads across
// the tile and the banner. Each external read is best-effort (failures → skipped)
// so standouts can never break the dashboard.
export const loadStandouts = cache(async (): Promise<Standout[]> => {
  const today = todayISO();
  const { recent } = await loadWellnessDays();
  if (!recent.length) return [];

  let weekKm: { weekStart: string; km: number }[] = [];
  try {
    const since = isoDate(new Date(new Date(today + 'T00:00:00').getTime() - 77 * 86_400_000));
    const runs = await listRunningDoneSince(since);
    const buckets = new Map<string, number>();
    for (const r of runs) buckets.set(mondayOf(r.date), (buckets.get(mondayOf(r.date)) ?? 0) + r.km);
    const currentWeek = mondayOf(today);
    weekKm = [...buckets.entries()]
      .filter(([wk]) => wk !== currentWeek)                 // drop the in-progress week
      .map(([weekStart, km]) => ({ weekStart, km }))
      .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
  } catch { /* weekly volume optional */ }

  let races: StandoutRace[] = [];
  try {
    const since = isoDate(new Date(new Date(today + 'T00:00:00').getTime() - 7 * 86_400_000)); // races within a week
    const raw = await listRecentRaces(since);
    races = raw.map(r => ({
      date: r.date, name: r.name,
      timeSec: (r.mins ?? 0) * 60,
      targetSec: r.targetPace && r.distanceKm ? (paceToSec(r.targetPace) ?? 0) * r.distanceKm : null,
    }));
  } catch { /* races optional */ }

  return standouts({ days: recent, asOf: today, weekKm, races });
});

// Per-week plan series (planned TSS + longest planned run) for the Weekly-load
// and Longest-run trend cards. Its own cached read behind <Suspense> so the
// whole-plan session fetch can't block the dashboard body. Planned values only —
// the plan's prescribed trajectory.
export interface WeekSeriesPoint {
  weekNumber: number;
  phase: string;
  plannedTss: number;
  doneTss: number;        // actual logged TSS for the week (0 for future weeks)
  longestRunKm: number;
  isCurrent: boolean;
  isPast: boolean;        // week entirely before today
  isRace: boolean;
}
export const loadWeeklyPlanSeries = cache(async (): Promise<WeekSeriesPoint[]> => {
  const today = todayISO();
  const weekRow = await getCurrentWeek(today);
  const planId = (weekRow?.plan_id as number | null) ?? null;
  if (!planId) return [];
  const weeks = (await listPlanPhaseWeeks(planId)) as { phase: string; date_from: string; date_to: string; week_number: number }[];
  if (!weeks.length) return [];
  const start = weeks[0].date_from, end = weeks[weeks.length - 1].date_to;
  const [sessions, completedTss] = await Promise.all([
    listSessionsBetween(start, end) as Promise<PlanSession[]>,
    listCompletedTssBetween(start, today),
  ]);
  // Actual TSS logged per date (all sports — weekly load is total training stress).
  const doneByDate = new Map<string, number>();
  for (const c of completedTss) {
    if (c.completed_date && c.tss != null) {
      doneByDate.set(c.completed_date, (doneByDate.get(c.completed_date) ?? 0) + Number(c.tss));
    }
  }
  return weeks.map(w => {
    const inWeek = sessions.filter(s => s.scheduled_date >= w.date_from && s.scheduled_date <= w.date_to);
    const plannedTss = inWeek.reduce((sum, s) => sum + (s.estimated_tss ?? 0), 0);
    let doneTss = 0;
    for (const [date, tss] of doneByDate) if (date >= w.date_from && date <= w.date_to) doneTss += tss;
    const runKms = inWeek
      .filter(s => resolveSport(s) === 'run' || s.session_type === 'RACE')
      .map(s => Number(s.distance_km) || 0);
    return {
      weekNumber: w.week_number,
      phase: w.phase,
      plannedTss: Math.round(plannedTss),
      doneTss: Math.round(doneTss),
      longestRunKm: runKms.length ? Math.max(...runKms) : 0,
      isCurrent: w.date_from <= today && w.date_to >= today,
      isPast: w.date_to < today,
      isRace: inWeek.some(s => s.session_type === 'RACE'),
    };
  });
});
