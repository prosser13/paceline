// Shared dashboard data loader — all the queries and derivations the dashboard
// (src/app/page.tsx) and its sub-components need, in one place.

import { cache } from 'react';
import { getCurrentUser } from '@/lib/supabase-server';
import { getWellnessCached } from '@/lib/intervals';
import {
  getCurrentWeek, getNextRace, getPlanStrengthPriority, listPlanPhaseWeeks,
} from '@/data/plans';
import { getThresholdPace, listPaceZones, listHrZones, listPowerZones, listBikeHrZones } from '@/data/zones';
import {
  listSessionsBetween, listSessionDistancesBetween, listCompletedBetween,
  listCompletedForSessions, listCompletedDistancesBetween, getMostRecentCompletedSession,
} from '@/data/plan-sessions';
import { listOffPlanActivitiesBetween, type OffPlanActivity } from '@/data/activities';
import { getLatestCoachMessage, type CoachMessage } from '@/data/coach';
import { activityKind } from '@/lib/activity-types';
import { resolveSport, sportSpec } from '@/lib/sports/registry';
import { intraDayOrder, strengthFirstOrder } from '@/lib/session-order';
import { buildZoneMaps } from '@/lib/zone-builders';
import { buildCompletedActuals, parseThresholdPace, type CompletedActuals } from '@/lib/completed';
import { sessionTss } from '@/lib/run-tss';
import type { ZoneMap, HrZoneMap } from '@/lib/plan-structure';
import type { PowerZoneMap, BikeHrZoneMap } from '@/lib/cycling';
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
  todayCompleted: CompletedToday | null;
  strengthFirst: boolean;

  upcomingWithRest: PlanSession[]; // days +2..+7, rest-filled
  windowDays: WindowDay[];         // today..+6 (7 entries)

  zones: ZoneMap;
  hrZones: HrZoneMap;
  powerZones: PowerZoneMap;
  bikeHrZones: BikeHrZoneMap;
  thresholdPace: string;

  hasPlanWeek: boolean;
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

  // Next-race card: nearest upcoming RACE session (incl. tune-ups), with its A/B/C priority.
  nextRace: { name: string; daysTo: number | null; dateStr: string | null; priority: string | null; km: number | null } | null;

  weekPlannedKm: number | null;
  weekDoneKm: number;
  weekToGoKm: number;
  weekDays: WeekDay[];

  last7: { totalKm: number; sessions: number; h: number; m: number; totalTss: number };

  offPlanToday: OffPlanActivity[];   // extras done today (shown under the Today node)
  offPlanRecent: OffPlanActivity[];  // extras in the last 7 days (excl. today)

  // Recently completed — latest finished run/ride before today, rendered by the
  // same hero as Today. `recentLabel` is the dated header e.g. "Thu 25 Jun · Done".
  recentSession: PlanSession | null;
  recentCompleted: CompletedToday | null;
  recentLabel: string | null;

  coachMessage: CoachMessage | null;   // latest 9pm evening-review message
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
  const h = new Date().getHours();
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
  const today       = new Date();
  const todayStr    = isoDate(today);
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
    weekRow,
    raceRow,
    offPlanRaw,
    recentCompletedRaw,
    coachMessage,
  ] = await Promise.all([
    getCurrentUser(),
    listSessionsBetween(todayStr, weekEndStr),
    listCompletedBetween(weekAgoStr, todayStr),
    getThresholdPace(),
    listPaceZones(),
    listHrZones(),
    listPowerZones(),
    listBikeHrZones(),
    getCurrentWeek(todayStr),
    getNextRace(todayStr),
    listOffPlanActivitiesBetween(weekAgoStr, todayStr),
    getMostRecentCompletedSession(todayStr),
    getLatestCoachMessage(),
  ]);

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
  // The day's primary cardio session (run/ride) feeds the hero + "next up".
  function pickRun(list?: PlanSession[]): PlanSession | null {
    return list?.find(s => sportSpec(s).isMain) ?? null;
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

  const { zones, hrZones, powerZones, bikeHrZones, ftp } = buildZoneMaps({
    paceZones, hrZones: hrZoneRows, powerZones: powerZoneRows, bikeHrZones: bikeHrZoneRows,
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
  const totalTss = Math.round((recent ?? []).reduce((s, w) => {
    const mins = w.actual_duration_mins ? Number(w.actual_duration_mins) : null;
    // NGP-based rTSS when available, else average pace.
    const runPace = w.actual_ngp_min_km != null ? Number(w.actual_ngp_min_km)
      : w.actual_avg_pace_min_km ? Number(w.actual_avg_pace_min_km) : null;
    if (mins == null || runPace == null || runPace <= 0) return s;
    const IF = threshMinKm / runPace;
    return s + (mins / 60) * IF * IF * 100;
  }, 0));

  const weekLabel   = weekRow ? `${weekRow.phase} · Week ${weekRow.week_number}` : 'This week';
  const weekPurpose = (weekRow?.purpose as string | null) ?? null;

  let daysToRace: number | null = null;
  if (raceRow?.race_date) {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    daysToRace = Math.ceil((new Date(raceRow.race_date + 'T00:00:00').getTime() - t.getTime()) / 86400000);
  }
  const raceName = (raceRow?.name as string | null) ?? null;
  const raceDateStr = raceRow?.race_date ? fmtWeekdayDate(raceRow.race_date) : null;

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
    };
  } else if (raceName) {
    nextRace = { name: raceName, daysTo: daysToRace, dateStr: raceDateStr, priority: null, km: null };
  }

  // Per-session completion: which of today's sessions are logged, plus the run's
  // rich completion (drives the run hero's pace/HR breakdown).
  const todayDoneIds = todaySessions.filter(s => completionById.get(s.id)).map(s => s.id);
  const cw = todaySession ? completionById.get(todaySession.id) ?? null : null;

  const todayCompleted: CompletedToday | null = cw ? buildCompletedActuals(cw, threshMinKm, ftp) : null;

  // Recently completed — the latest finished run/ride before today. Rendered by
  // the SAME hero as Today (one card to maintain), with a dated "· Done" label.
  let recentSession: PlanSession | null = null;
  let recentCompleted: CompletedToday | null = null;
  let recentLabel: string | null = null;
  if (recentCompletedRaw) {
    const { cw: rcw, ps } = recentCompletedRaw;
    recentSession = ps as unknown as PlanSession;
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
    weekPlannedKm = Math.round((weekSessions ?? []).reduce((s, x) => s + (Number(x.distance_km) || 0), 0));

    const plannedByDate = new Map<string, number>();
    const raceKmByDate = new Map<string, number>();
    for (const s of weekSessions ?? []) {
      plannedByDate.set(s.scheduled_date, (plannedByDate.get(s.scheduled_date) ?? 0) + (Number(s.distance_km) || 0));
      // Race days (any race type) get their distance flagged so the bar splits.
      if (s.session_type === 'RACE') {
        raceKmByDate.set(s.scheduled_date, (raceKmByDate.get(s.scheduled_date) ?? 0) + (Number(s.distance_km) || 0));
      }
    }
    // "This week" tracks RUNNING volume only — exclude rides and
    // strength/core/yoga completions so a logged ride doesn't inflate the km.
    const isRunCompletion = (c: { plan_sessions?: unknown }) => {
      const ps = Array.isArray(c.plan_sessions) ? c.plan_sessions[0] : c.plan_sessions;
      if (!ps) return true; // off-plan completion — assume a run
      return sportSpec(ps as { session_type?: string | null; activity_type?: string | null }).countsToWeeklyVolume;
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

  return {
    firstName, greeting: greet(), todayFull, todayStr,
    todaySession, tomorrowSession, tomorrowStrength, todaySessions, todayDoneIds, todayCompleted,
    strengthFirst,
    upcomingWithRest, windowDays,
    zones, hrZones, powerZones, bikeHrZones, thresholdPace,
    hasPlanWeek: !!weekRow,
    weekLabel, weekPurpose,
    weekNumber: (weekRow?.week_number as number | null) ?? null,
    weeksTotal: (planWeeks?.length as number | undefined) ?? null,
    weekPhase: (weekRow?.phase as string | null) ?? null,
    phaseSegments, todayPct, ringPct,
    daysToRace, raceName, raceDateStr, raceTargetTime: (raceRow?.target_time as string | null) ?? null, nextRace,
    weekPlannedKm, weekDoneKm, weekToGoKm, weekDays,
    last7: { totalKm, sessions, h, m, totalTss },
    offPlanToday, offPlanRecent,
    recentSession, recentCompleted, recentLabel,
    coachMessage,
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
