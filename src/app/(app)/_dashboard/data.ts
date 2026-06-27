// Shared dashboard data loader — all the queries and derivations the dashboard
// (src/app/page.tsx) and its sub-components need, in one place.

import { getCurrentUser } from '@/lib/supabase-server';
import { getWellnessCached } from '@/lib/intervals';
import {
  getCurrentWeek, getNextRace, getPlanStrengthPriority, listPlanPhaseWeeks,
} from '@/data/plans';
import { getThresholdPace, listPaceZones, listHrZones, listPowerZones, listBikeHrZones } from '@/data/zones';
import {
  listSessionsBetween, listSessionDistancesBetween, listCompletedBetween,
  getCompletedForSession, listCompletedDistancesBetween, getMostRecentCompletedSession,
} from '@/data/plan-sessions';
import { listOffPlanActivitiesBetween, type OffPlanActivity } from '@/data/activities';
import { activityKind } from '@/lib/activity-types';
import { intraDayOrder, strengthFirstOrder } from '@/lib/session-order';
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

export interface CompletedToday {
  durationStr: string; mins: number | null; tss: number | null; distanceKm: number | null;
  avgHr: number | null;
  avgPower: number | null;   // rides only
  segmentActuals: (number | null)[] | null;
  segmentHr: (number | null)[] | null;
}

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

  phaseSegments: PhaseSeg[];
  todayPct: number | null;
  ringPct: number;

  daysToRace: number | null;
  raceName: string | null;
  raceDateStr: string | null;

  weekPlannedKm: number | null;
  weekDoneKm: number;
  weekToGoKm: number;
  weekDays: WeekDay[];

  fitnessForm: { form: number | null; fitness: number | null; fatigue: number | null } | null;
  fitnessHistory: { date: string; ctl: number; atl: number }[] | null;

  last7: { totalKm: number; sessions: number; h: number; m: number; totalTss: number };

  offPlanToday: OffPlanActivity[];   // extras done today (shown under the Today node)
  offPlanRecent: OffPlanActivity[];  // extras in the last 7 days (excl. today)

  // Recently completed — latest finished run/ride before today, rendered by the
  // same hero as Today. `recentLabel` is the dated header e.g. "Thu 25 Jun · Done".
  recentSession: PlanSession | null;
  recentCompleted: CompletedToday | null;
  recentLabel: string | null;
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

// Long-weekday + date label for the agenda spine (e.g. "Thursday" / "26 Jun").
export function formatSpineDay(iso: string): { weekday: string; date: string } {
  const dt = new Date(iso + 'T00:00:00');
  return {
    weekday: dt.toLocaleDateString('en-GB', { weekday: 'long' }),
    date:    dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
  };
}

// Build the rich completion (drives the run/ride hero's actuals, profile
// colouring and compare table) from a raw completed_workouts row. Shared by
// Today and Recently-completed so both compute identically — change once.
function buildCompleted(
  cw: {
    actual_duration_mins?: number | string | null;
    actual_avg_pace_min_km?: number | string | null;
    actual_avg_power?: number | string | null;
    actual_distance_km?: number | string | null;
    actual_avg_hr?: number | string | null;
    segment_actuals?: unknown;
    segment_hr?: unknown;
  },
  threshMinKm: number,
  ftp: number | null,
): CompletedToday {
  const mins = cw.actual_duration_mins ? Number(cw.actual_duration_mins) : null;
  const pace = cw.actual_avg_pace_min_km ? Number(cw.actual_avg_pace_min_km) : null;
  const avgPower = cw.actual_avg_power != null ? Number(cw.actual_avg_power) : null;
  const durationStr = mins != null
    ? `${Math.floor(mins / 60)}:${String(Math.round(mins % 60)).padStart(2, '0')}`
    : '';
  let tss: number | null = null;
  if (mins != null && pace != null && pace > 0) {
    const IF = threshMinKm / pace;                 // run: pace vs threshold
    tss = Math.round((mins / 60) * IF * IF * 100);
  } else if (mins != null && avgPower != null && ftp && ftp > 0) {
    const IF = avgPower / ftp;                      // ride: power vs FTP
    tss = Math.round((mins / 60) * IF * IF * 100);
  }
  return {
    durationStr, mins, tss,
    distanceKm: cw.actual_distance_km ? Number(cw.actual_distance_km) : null,
    avgHr: cw.actual_avg_hr != null ? Number(cw.actual_avg_hr) : null,
    avgPower,
    segmentActuals: (cw.segment_actuals as (number | null)[] | null) ?? null,
    segmentHr: (cw.segment_hr as (number | null)[] | null) ?? null,
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
    wellness,
    offPlanRaw,
    recentCompletedRaw,
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
    getWellnessCached(),
    listOffPlanActivitiesBetween(weekAgoStr, todayStr),
    getMostRecentCompletedSession(todayStr),
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
  // Same-day ordering: strength leads on strength-priority plans (Dragon 50),
  // otherwise the run/ride leads. Mirrors the plan page.
  const planId = (weekRow?.plan_id as number | null) ?? null;
  const strengthFirst = planId ? await getPlanStrengthPriority(planId) : false;
  // Display order within a day: the sequence sessions are actually done in
  // (warm-up → run → stretch → core → strength), or strength-first on
  // strength-priority plans. STRENGTH and CORE share a tier.
  const isStrengthTier = (s: PlanSession) => s.session_type === 'STRENGTH' || s.session_type === 'CORE';
  for (const list of byDate.values()) {
    list.sort((a, b) =>
      strengthFirst
        ? strengthFirstOrder(a) - strengthFirstOrder(b)
        : intraDayOrder(a) - intraDayOrder(b));
  }
  function pickRun(list?: PlanSession[]): PlanSession | null {
    return list?.find(s => !isStrengthTier(s) && s.session_type !== 'YOGA') ?? null;
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

  const fitnessForm    = wellness.form;
  const fitnessHistory = wellness.history;

  const thresholdPace = thresholdPaceRaw ?? '3:40';
  const threshParts   = thresholdPace.split(':').map(Number);
  const threshMinKm   = threshParts[0] + (threshParts[1] || 0) / 60;

  // Off-plan extras: run TSS from pace, then split today vs recent (newest-first
  // already from the query).
  for (const a of offPlanRaw) {
    if (activityKind(a.activityType) === 'run' && a.durationMins != null && a.avgPaceMinKm && a.avgPaceMinKm > 0) {
      const IF = threshMinKm / a.avgPaceMinKm;
      a.tss = Math.round((a.durationMins / 60) * IF * IF * 100);
    }
  }
  const offPlanToday  = offPlanRaw.filter(a => a.date === todayStr);
  const offPlanRecent = offPlanRaw.filter(a => a.date !== todayStr);

  const zones: ZoneMap = {};
  for (const z of paceZones) {
    zones[z.zone_key] = { key: z.zone_key, name: z.name, paceMin: z.pace_min, paceMax: z.pace_max, sortOrder: z.sort_order };
  }
  const hrZones: HrZoneMap = {};
  for (const z of hrZoneRows) {
    hrZones[z.zone_key] = { min: z.hr_min, max: z.hr_max };
  }

  const powerZones: PowerZoneMap = {};
  for (const z of powerZoneRows) {
    powerZones[z.zone_key] = { key: z.zone_key, name: z.name, powerMin: z.power_min, powerMax: z.power_max, sortOrder: z.sort_order };
  }
  const bikeHrZones: BikeHrZoneMap = {};
  for (const z of bikeHrZoneRows) {
    bikeHrZones[z.zone_key] = { min: z.hr_min, max: z.hr_max };
  }

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
    const isRide = (s: PlanSession) => s.activity_type === 'cycling';
    windowDays.push({
      iso,
      short: fmtShort(iso),
      dateLabel: fmtDate(iso),
      isToday: i === 0,
      isTomorrow: i === 1,
      sessions,
      volumeKm,
      hasRun: sessions.some(s => !isStrengthTier(s) && s.session_type !== 'YOGA' && !isRide(s)),
      hasRide: sessions.some(isRide),
      hasStrength: sessions.some(isStrengthTier),
      hasYoga: sessions.some(s => s.session_type === 'YOGA'),
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
    const pace = w.actual_avg_pace_min_km ? Number(w.actual_avg_pace_min_km) : null;
    if (mins == null || pace == null || pace <= 0) return s;
    const IF = threshMinKm / pace;
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
  const raceDateStr = raceRow?.race_date
    ? new Date(raceRow.race_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : null;

  // ── Tier 2 ──
  const [todayCompletions, weekData, planWeeks] = await Promise.all([
    Promise.all(todaySessions.map(s => getCompletedForSession(s.id))),
    weekRow?.date_from && weekRow?.date_to
      ? Promise.all([
          listSessionDistancesBetween(weekRow.date_from, weekRow.date_to),
          listCompletedDistancesBetween(weekRow.date_from, weekRow.date_to),
        ])
      : Promise.resolve(null),
    planId ? listPlanPhaseWeeks(planId) : Promise.resolve([]),
  ]);

  // Per-session completion: which of today's sessions are logged, plus the run's
  // rich completion (drives the run hero's pace/HR breakdown).
  const todayDoneIds = todaySessions.filter((_, i) => todayCompletions[i]).map(s => s.id);
  const cw = todaySession
    ? todayCompletions[todaySessions.findIndex(s => s.id === todaySession.id)] ?? null
    : null;

  // FTP proxy = the top of the Threshold (Z4) power zone — drives ride TSS the
  // same way threshold pace drives run TSS. Updates if the zones are edited.
  const ftp = powerZones['Z4']?.powerMax ?? null;

  const todayCompleted: CompletedToday | null = cw ? buildCompleted(cw, threshMinKm, ftp) : null;

  // Recently completed — the latest finished run/ride before today. Rendered by
  // the SAME hero as Today (one card to maintain), with a dated "· Done" label.
  let recentSession: PlanSession | null = null;
  let recentCompleted: CompletedToday | null = null;
  let recentLabel: string | null = null;
  if (recentCompletedRaw) {
    const { cw: rcw, ps } = recentCompletedRaw;
    recentSession = ps as unknown as PlanSession;
    recentCompleted = buildCompleted(rcw, threshMinKm, ftp);
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
    const NON_RUN = new Set(['STRENGTH', 'CORE', 'YOGA']);
    const isRunCompletion = (c: { plan_sessions?: unknown }) => {
      const ps = Array.isArray(c.plan_sessions) ? c.plan_sessions[0] : c.plan_sessions;
      if (!ps) return true; // off-plan completion — assume a run
      const p = ps as { session_type?: string | null; activity_type?: string | null };
      return p.activity_type !== 'cycling' && !NON_RUN.has(p.session_type ?? '');
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
    phaseSegments, todayPct, ringPct,
    daysToRace, raceName, raceDateStr,
    weekPlannedKm, weekDoneKm, weekToGoKm, weekDays,
    fitnessForm, fitnessHistory,
    last7: { totalKm, sessions, h, m, totalTss },
    offPlanToday, offPlanRecent,
    recentSession, recentCompleted, recentLabel,
  };
}
