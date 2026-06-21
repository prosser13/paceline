// Shared dashboard data loader — all the queries and derivations the dashboard
// (src/app/page.tsx) and its sub-components need, in one place.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { createClient } from '@/lib/supabase-server';
import { getWellnessCached } from '@/lib/intervals';
import {
  getCurrentWeek, getNextRace, getPlanStrengthPriority, listPlanPhaseWeeks,
} from '@/data/plans';
import type { ZoneMap, HrZoneMap } from '@/lib/plan-structure';
import type { PhaseSeg, WeekDay } from '@/components/dashboard-graphics';

export interface PlanSession {
  id: string;
  scheduled_date: string;
  session_type?: string | null;
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
  hasStrength: boolean;
}

export interface DashboardData {
  firstName: string;
  greeting: string;
  todayFull: string;
  todayStr: string;

  todaySession: PlanSession | null;
  tomorrowSession: PlanSession | null;
  todayStrength: PlanSession | null;
  tomorrowStrength: PlanSession | null;
  todayCompleted: CompletedToday | null;
  strengthFirst: boolean;

  upcomingWithRest: PlanSession[]; // days +2..+7, rest-filled
  windowDays: WindowDay[];         // today..+6 (7 entries)

  zones: ZoneMap;
  hrZones: HrZoneMap;
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
  weekDays: WeekDay[];

  fitnessForm: { form: number | null; fitness: number | null; fatigue: number | null } | null;
  fitnessHistory: { date: string; ctl: number; atl: number }[] | null;

  last7: { totalKm: number; sessions: number; h: number; m: number; totalTss: number };
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
  while (d <= end) { out.push(isoDate(d)); d.setDate(d.getDate() + 1); }
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

export async function loadDashboardData(): Promise<DashboardData> {
  const supabase = await createClient();

  const today       = new Date();
  const todayStr    = isoDate(today);
  const tomorrowStr = isoDate(addDays(today, 1));
  const weekAgoStr  = isoDate(addDays(today, -7));
  const weekEndStr  = isoDate(addDays(today, 7));
  const todayFull   = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  // ── Tier 1 ──
  const [
    { data: { user } },
    { data: windowSessions },
    { data: recent },
    { data: appConfig },
    { data: paceZones },
    { data: hrZoneRows },
    weekRow,
    raceRow,
    wellness,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabaseAdmin.from('plan_sessions').select('*')
      .gte('scheduled_date', todayStr).lte('scheduled_date', weekEndStr)
      .order('scheduled_date', { ascending: true }).order('am_pm', { ascending: true }),
    supabaseAdmin.from('completed_workouts')
      .select('actual_distance_km, actual_duration_mins, actual_avg_pace_min_km')
      .gte('completed_date', weekAgoStr).lte('completed_date', todayStr),
    supabaseAdmin.from('app_config').select('threshold_pace_per_km').limit(1).maybeSingle(),
    supabaseAdmin.from('pace_zones').select('*').order('sort_order'),
    supabaseAdmin.from('hr_zones').select('*').order('sort_order'),
    getCurrentWeek(todayStr),
    getNextRace(todayStr),
    getWellnessCached(),
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
  for (const list of byDate.values()) {
    list.sort((a, b) => (a.session_type === 'STRENGTH' ? 1 : 0) - (b.session_type === 'STRENGTH' ? 1 : 0));
  }
  function pickRun(list?: PlanSession[]): PlanSession | null {
    return list?.find(s => s.session_type !== 'STRENGTH') ?? null;
  }
  function pickStrength(list?: PlanSession[]): PlanSession | null {
    return list?.find(s => s.session_type === 'STRENGTH') ?? null;
  }

  const todaySession     = pickRun(byDate.get(todayStr));
  const tomorrowSession  = pickRun(byDate.get(tomorrowStr));
  const todayStrength    = pickStrength(byDate.get(todayStr));
  const tomorrowStrength = pickStrength(byDate.get(tomorrowStr));

  const fitnessForm    = wellness.form;
  const fitnessHistory = wellness.history;

  const thresholdPace = appConfig?.threshold_pace_per_km ?? '3:40';
  const threshParts   = thresholdPace.split(':').map(Number);
  const threshMinKm   = threshParts[0] + (threshParts[1] || 0) / 60;

  const zones: ZoneMap = {};
  for (const z of paceZones ?? []) {
    zones[z.zone_key] = { key: z.zone_key, name: z.name, paceMin: z.pace_min, paceMax: z.pace_max, sortOrder: z.sort_order };
  }
  const hrZones: HrZoneMap = {};
  for (const z of hrZoneRows ?? []) {
    hrZones[z.zone_key] = { min: z.hr_min, max: z.hr_max };
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
    windowDays.push({
      iso,
      short: fmtShort(iso),
      dateLabel: fmtDate(iso),
      isToday: i === 0,
      isTomorrow: i === 1,
      sessions,
      volumeKm,
      hasRun: sessions.some(s => s.session_type !== 'STRENGTH'),
      hasStrength: sessions.some(s => s.session_type === 'STRENGTH'),
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
  const planId      = (weekRow?.plan_id as number | null) ?? null;

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
  const [{ data: cw }, weekData, planWeeks, strengthFirst] = await Promise.all([
    todaySession
      ? supabaseAdmin.from('completed_workouts')
          .select('actual_duration_mins, actual_avg_pace_min_km, actual_distance_km, actual_avg_hr, segment_actuals, segment_hr')
          .eq('plan_session_id', todaySession.id).maybeSingle()
      : Promise.resolve({ data: null }),
    weekRow?.date_from && weekRow?.date_to
      ? Promise.all([
          supabaseAdmin.from('plan_sessions').select('scheduled_date, distance_km')
            .gte('scheduled_date', weekRow.date_from).lte('scheduled_date', weekRow.date_to),
          supabaseAdmin.from('completed_workouts').select('completed_date, actual_distance_km')
            .gte('completed_date', weekRow.date_from).lte('completed_date', weekRow.date_to),
        ])
      : Promise.resolve(null),
    planId ? listPlanPhaseWeeks(planId) : Promise.resolve([]),
    planId ? getPlanStrengthPriority(planId) : Promise.resolve(false),
  ]);

  let todayCompleted: CompletedToday | null = null;
  if (cw) {
    const mins = cw.actual_duration_mins ? Number(cw.actual_duration_mins) : null;
    const pace = cw.actual_avg_pace_min_km ? Number(cw.actual_avg_pace_min_km) : null;
    const durationStr = mins != null
      ? `${Math.floor(mins / 60)}:${String(Math.round(mins % 60)).padStart(2, '0')}`
      : '';
    let tss: number | null = null;
    if (mins != null && pace != null && pace > 0) {
      const IF = threshMinKm / pace;
      tss = Math.round((mins / 60) * IF * IF * 100);
    }
    todayCompleted = {
      durationStr, mins, tss,
      distanceKm: cw.actual_distance_km ? Number(cw.actual_distance_km) : null,
      avgHr: cw.actual_avg_hr != null ? Number(cw.actual_avg_hr) : null,
      segmentActuals: (cw.segment_actuals as (number | null)[] | null) ?? null,
      segmentHr: (cw.segment_hr as (number | null)[] | null) ?? null,
    };
  }

  let weekPlannedKm: number | null = null;
  let weekDoneKm = 0;
  let weekDays: WeekDay[] = [];
  if (weekData && weekRow?.date_from && weekRow?.date_to) {
    const [{ data: weekSessions }, { data: weekCompleted }] = weekData;
    weekPlannedKm = Math.round((weekSessions ?? []).reduce((s, x) => s + (Number(x.distance_km) || 0), 0));

    const plannedByDate = new Map<string, number>();
    for (const s of weekSessions ?? []) {
      plannedByDate.set(s.scheduled_date, (plannedByDate.get(s.scheduled_date) ?? 0) + (Number(s.distance_km) || 0));
    }
    const doneByDate = new Map<string, number>();
    for (const c of weekCompleted ?? []) {
      if (!c.completed_date) continue;
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
      return { label, km, state };
    });
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
    todaySession, tomorrowSession, todayStrength, tomorrowStrength, todayCompleted, strengthFirst,
    upcomingWithRest, windowDays,
    zones, hrZones, thresholdPace,
    hasPlanWeek: !!weekRow,
    weekLabel, weekPurpose,
    phaseSegments, todayPct, ringPct,
    daysToRace, raceName, raceDateStr,
    weekPlannedKm, weekDoneKm, weekDays,
    fitnessForm, fitnessHistory,
    last7: { totalKm, sessions, h, m, totalTss },
  };
}
