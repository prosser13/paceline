// Plan-page data loader — every query and derivation the plan view needs, in one
// place (mirrors _dashboard/data.ts). Keeping it out of page.tsx lets the page be
// a thin server component and stream the heavy thread behind a <Suspense>.

import { listWeeksByNumber, listPlansBySortOrder } from '@/data/plans';
import { getThresholdPace, listPaceZones, listHrZones, listPowerZones, listBikeHrZones } from '@/data/zones';
import { listAllSessions, listAllCompleted } from '@/data/plan-sessions';
import { listOffPlanActivitiesBetween, getActivityNamesByStravaIds, type OffPlanActivity } from '@/data/activities';
import { listUserMatches } from '@/data/session-matches';
import { activityKind } from '@/lib/activity-types';
import { intraDayOrder, strengthFirstOrder } from '@/lib/session-order';
import { buildZoneMaps } from '@/lib/zone-builders';
import { buildCompletedMap, parseThresholdPace, type CompletedActuals } from '@/lib/completed';
import { sessionTss } from '@/lib/run-tss';
import type { ZoneMap, HrZoneMap } from '@/lib/plan-structure';
import type { PowerZoneMap, BikeHrZoneMap } from '@/lib/cycling';
import type { MergedActivity } from './PlanThread';
import type { PlanOption } from './PlanSwitcher';

export interface PlanSession {
  id: string;
  plan_id?: number | null;
  week_number: number;
  session_type: string;
  activity_type?: string | null;
  name: string;
  description?: string | null;
  distance_km?: number | null;
  scheduled_date: string;
  status?: string | null;
  intensity?: string | null;
  estimated_tss?: number | null;
  estimated_duration?: string | null;
  target_pace?: string | null;
  race_slug?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  structure?: any[] | null;
}

export interface PlanWeek {
  week_number: number;
  phase: string;
  purpose?: string | null;
  planned_volume_km?: number | null;
  date_from: string;
  date_to: string;
  plan_id?: number | null;
}

export interface PlanRow {
  id: number;
  name: string;
  slug: string | null;
  kind: string;
  race_date: string | null;
  distance_km: number | null;
  target_time: string | null;
  target_pace: string | null;
  start_date: string | null;
  end_date: string | null;
  status: 'archived' | 'active' | 'future';
}

// Plan-page completion entry: the canonical actuals plus the legacy `durationMins`
// alias the row components (RunRow/CyclingRow) still read. The prop rename is
// deferred — see @/lib/completed.
type PlanCompleted = CompletedActuals & { durationMins: number | null };

export interface PlanData {
  todayStr: string;
  planOptions: PlanOption[];
  archiveCount: number;
  selectedPlan: PlanRow | null;
  viewPlan: PlanRow | null;
  viewWeeks: PlanWeek[];
  phaseSegments: { phase: string; pct: number }[];
  todayPct: number | null;
  thread: {
    weeks: PlanWeek[];
    byWeek: Record<number, PlanSession[]>;
    offPlanByDate: Record<string, OffPlanActivity[]>;
    manualMatches: { id: string; source: 'manual' | 'promoted' }[];
    mergedBySession: Record<string, MergedActivity[]>;
    todayStr: string;
    completedMap: Record<string, PlanCompleted>;
    nextSessionId: string | null;
    thresholdPace: string;
    zones: ZoneMap;
    hrZones: HrZoneMap;
    powerZones: PowerZoneMap;
    bikeHrZones: BikeHrZoneMap;
  };
}

export function fmtLong(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Every yyyy-mm-dd from `from` to `to` inclusive
function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  const d   = new Date(from + 'T00:00:00');
  const end = new Date(to   + 'T00:00:00');
  while (d <= end) {
    out.push(isoLocal(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export async function loadPlanData(planParam: string | undefined): Promise<PlanData> {
  const today    = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const [sessions, weeks, thresholdPaceRaw, completed, paceZones, hrZonesRows, powerZoneRows, bikeHrZoneRows, plans, manualMatches] = await Promise.all([
    listAllSessions(),
    listWeeksByNumber(),
    getThresholdPace(),
    listAllCompleted(),
    listPaceZones(),
    listHrZones(),
    listPowerZones(),
    listBikeHrZones(),
    listPlansBySortOrder(),
    listUserMatches(),
  ]);

  const thresholdPace = thresholdPaceRaw ?? '3:40';
  const threshMinKm   = parseThresholdPace(thresholdPace);
  const allSessions   = (sessions ?? []) as PlanSession[];
  const allWeeks      = (weeks   ?? []) as PlanWeek[];

  const { zones, hrZones, powerZones, bikeHrZones, ftp } = buildZoneMaps({
    paceZones, hrZones: hrZonesRows, powerZones: powerZoneRows, bikeHrZones: bikeHrZoneRows,
  });

  // plan_session_id → actual display values for done sessions (run NGP/pace or
  // ride power TSS), plus the legacy durationMins alias the rows read.
  const completedActuals = buildCompletedMap(completed ?? [], threshMinKm, ftp);
  const completedMap: Record<string, PlanCompleted> = {};
  for (const [id, a] of Object.entries(completedActuals)) {
    completedMap[id] = { ...a, durationMins: a.mins };
  }

  // Activities merged into a completion (a ride Strava split in two) → shown under
  // the session with an unmerge control. Names resolved in the tier-2 wave below.
  const mergedBySession: Record<string, MergedActivity[]> = {};
  const allMergedIds: number[] = [];
  for (const cw of completed ?? []) {
    const ids = ((cw.merged_strava_ids as number[] | null) ?? []).map(Number).filter(Boolean);
    if (cw.plan_session_id && ids.length) {
      mergedBySession[cw.plan_session_id as string] = ids.map(id => ({ stravaId: id, name: null }));
      allMergedIds.push(...ids);
    }
  }

  // Derive plan status from dates: archived (ended) / active (spans today) / future.
  const planRows = (plans ?? []) as Omit<PlanRow, 'status'>[];
  const withStatus: PlanRow[] = planRows.map(p => {
    let status: PlanRow['status'];
    if (p.end_date && p.end_date < todayStr) status = 'archived';
    else if (p.start_date && p.end_date && p.start_date <= todayStr && todayStr <= p.end_date) status = 'active';
    else status = 'future';
    return { ...p, status };
  });

  const activePlan  = withStatus.find(p => p.status === 'active') ?? null;
  const futurePlans = withStatus
    .filter(p => p.status === 'future')
    .sort((a, b) => ((a.start_date ?? '') < (b.start_date ?? '') ? -1 : 1));

  // ?plan=<slug> filters the page to one plan; default view is the active plan.
  const selectedPlan = planParam ? withStatus.find(p => p.slug === planParam) ?? null : null;
  const viewPlan  = selectedPlan ?? activePlan;
  const strengthFirst = !!(viewPlan as { strength_priority?: boolean } | null)?.strength_priority;
  const viewWeeks = viewPlan ? allWeeks.filter(w => w.plan_id === viewPlan.id) : [];

  // Sessions for the viewed plan only — week_number is per-plan, so grouping
  // without this filter would merge same-numbered weeks from other plans.
  const planSessions = viewPlan ? allSessions.filter(s => s.plan_id === viewPlan.id) : [];
  const byWeek = planSessions.reduce<Record<number, PlanSession[]>>((acc, s) => {
    (acc[s.week_number] ??= []).push(s);
    return acc;
  }, {});

  // "Next up": the very next session still to do — earliest by date, then by the
  // same intra-day order the rows render in.
  const nextSessionId = planSessions
    .filter(s => {
      if (s.scheduled_date < todayStr) return false;     // upcoming only
      if (s.id in completedMap) return false;
      const st = s.status;
      return st !== 'rest' && st !== 'skipped' && st !== 'missed_injury';
    })
    .sort((a, b) =>
      a.scheduled_date !== b.scheduled_date
        ? (a.scheduled_date < b.scheduled_date ? -1 : 1)
        : (strengthFirst ? strengthFirstOrder(a) - strengthFirstOrder(b) : intraDayOrder(a) - intraDayOrder(b)))
    [0]?.id ?? null;

  // Fill empty days of the current and future weeks with rest days (render-only,
  // not persisted). Past weeks are left as-is.
  for (const w of viewWeeks) {
    if (w.date_to < todayStr) continue;
    const wk = (byWeek[w.week_number] ??= []);
    const have = new Set(wk.map(s => s.scheduled_date));
    for (const date of eachDate(w.date_from, w.date_to)) {
      if (have.has(date)) continue;
      wk.push({
        id:            `rest-${date}`,
        week_number:   w.week_number,
        session_type:  'REST',
        name:          'Rest',
        scheduled_date: date,
        status:        'rest',
      } as PlanSession);
    }
    wk.sort((a, b) => {
      if (a.scheduled_date !== b.scheduled_date) return a.scheduled_date < b.scheduled_date ? -1 : 1;
      return strengthFirst
        ? strengthFirstOrder(a) - strengthFirstOrder(b)
        : intraDayOrder(a) - intraDayOrder(b);
    });
  }

  // Phase bar — merge consecutive same-phase weeks into proportional segments
  const planStart = viewWeeks[0]?.date_from;
  const planEnd   = viewWeeks[viewWeeks.length - 1]?.date_to;
  const phaseSegments: { phase: string; pct: number }[] = [];

  if (planStart && planEnd) {
    const totalMs = new Date(planEnd   + 'T00:00:00').getTime()
                  - new Date(planStart + 'T00:00:00').getTime() + 86400000;
    for (const w of viewWeeks) {
      const wMs  = new Date(w.date_to   + 'T00:00:00').getTime()
                 - new Date(w.date_from + 'T00:00:00').getTime() + 86400000;
      const pct  = (wMs / totalMs) * 100;
      const last = phaseSegments[phaseSegments.length - 1];
      if (last?.phase === w.phase) last.pct += pct;
      else phaseSegments.push({ phase: w.phase, pct });
    }
  }

  const todayPct = planStart && planEnd
    ? Math.max(0, Math.min(100,
        ((new Date(todayStr + 'T00:00:00').getTime() - new Date(planStart + 'T00:00:00').getTime()) /
         (new Date(planEnd  + 'T00:00:00').getTime() - new Date(planStart + 'T00:00:00').getTime() + 86400000)) * 100
      ))
    : null;

  // Tier 2 — two independent follow-ups in one wave: resolve merged-activity names
  // (needs the completions above) and fetch off-plan activities (needs planStart).
  // Previously two serial awaits; collapsed here.
  const [mergedNameRows, offPlanRaw] = await Promise.all([
    allMergedIds.length ? getActivityNamesByStravaIds(allMergedIds) : Promise.resolve([]),
    planStart ? listOffPlanActivitiesBetween(planStart, todayStr) : Promise.resolve([]),
  ]);

  if (mergedNameRows.length) {
    const names = new Map(mergedNameRows.map(n => [n.stravaActivityId, n.name]));
    for (const list of Object.values(mergedBySession)) {
      for (const m of list) m.name = names.get(m.stravaId) ?? null;
    }
  }

  // Off-plan activities (synced but unmatched) bucketed by date. Run TSS from pace;
  // rides/strength carry none.
  const offPlanByDate: Record<string, OffPlanActivity[]> = {};
  for (const a of offPlanRaw) {
    if (activityKind(a.activityType) === 'run') {
      const tss = sessionTss({ mins: a.durationMins, runPace: a.avgPaceMinKm ?? null, power: null }, threshMinKm, null);
      if (tss != null) a.tss = tss;
    }
    (offPlanByDate[a.date] ??= []).push(a);
  }

  // Plans for the header dropdown — the live plan (→ /plan) then upcoming plans.
  const archiveCount = withStatus.filter(p => p.status === 'archived').length;
  const futureDot = ['#14617e', '#8f6512', '#4f7a52'];
  const planOptions: PlanOption[] = [
    ...(activePlan ? [{
      name: activePlan.name, slug: activePlan.slug, dot: '#8c2b2b', active: true,
      sub: activePlan.end_date ? `Active plan · ends ${fmtLong(activePlan.end_date)}` : 'Active plan',
    }] : []),
    ...futurePlans.map((p, i) => ({
      name: p.name, slug: p.slug, dot: futureDot[i % futureDot.length], active: false,
      sub: p.start_date ? `Starts ${fmtLong(p.start_date)}` : 'Upcoming',
    })),
  ];

  return {
    todayStr,
    planOptions,
    archiveCount,
    selectedPlan,
    viewPlan,
    viewWeeks,
    phaseSegments,
    todayPct,
    thread: {
      weeks: viewWeeks,
      byWeek,
      offPlanByDate,
      manualMatches,
      mergedBySession,
      todayStr,
      completedMap,
      nextSessionId,
      thresholdPace,
      zones,
      hrZones,
      powerZones,
      bikeHrZones,
    },
  };
}
