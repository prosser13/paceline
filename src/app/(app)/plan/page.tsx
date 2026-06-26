export const dynamic = 'force-dynamic';
import { listWeeksByNumber, listPlansBySortOrder } from '@/data/plans';
import { getThresholdPace, listPaceZones, listHrZones, listPowerZones, listBikeHrZones } from '@/data/zones';
import { listAllSessions, listAllCompleted } from '@/data/plan-sessions';
import { listOffPlanActivitiesBetween, getActivityNamesByStravaIds, type OffPlanActivity } from '@/data/activities';
import { listUserMatches } from '@/data/session-matches';
import { activityKind } from '@/lib/activity-types';
import { intraDayOrder, strengthFirstOrder } from '@/lib/session-order';
import PlanThread from './PlanThread';
import RaceBlock from './RaceBlock';
import PlanSwitcher, { type PlanOption } from './PlanSwitcher';
import PhaseBar from '@/components/PhaseBar';
import type { ZoneMap, HrZoneMap } from '@/lib/plan-structure';
import type { PowerZoneMap, BikeHrZoneMap } from '@/lib/cycling';

interface PlanSession {
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

interface PlanWeek {
  week_number: number;
  phase: string;
  purpose?: string | null;
  planned_volume_km?: number | null;
  date_from: string;
  date_to: string;
  plan_id?: number | null;
}

interface PlanRow {
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

function fmtLong(dateStr: string): string {
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

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan: planParam } = await searchParams;
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
  const allSessions   = (sessions ?? []) as PlanSession[];
  const allWeeks      = (weeks   ?? []) as PlanWeek[];

  const zones: ZoneMap = {};
  for (const z of paceZones) {
    zones[z.zone_key] = { key: z.zone_key, name: z.name, paceMin: z.pace_min, paceMax: z.pace_max, sortOrder: z.sort_order };
  }

  const hrZones: HrZoneMap = {};
  for (const z of hrZonesRows) {
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

  // FTP proxy = top of the Threshold (Z4) power zone — drives ride TSS the same
  // way threshold pace drives run TSS.
  const ftp = powerZones['Z4']?.powerMax ?? null;

  // Build map of plan_session_id → actual display values for done sessions
  const completedMap: Record<string, { durationStr: string; durationMins: number | null; distanceKm: number | null; tss: number | null; avgHr: number | null; avgPower: number | null; segmentActuals: (number | null)[] | null; segmentHr: (number | null)[] | null }> = {};
  for (const cw of completed ?? []) {
    if (!cw.plan_session_id) continue;
    const mins  = cw.actual_duration_mins ? Number(cw.actual_duration_mins) : null;
    const pace  = cw.actual_avg_pace_min_km ? Number(cw.actual_avg_pace_min_km) : null;
    const power = cw.actual_avg_power != null ? Number(cw.actual_avg_power) : null;
    const durationStr = mins != null
      ? `${Math.floor(mins / 60)}:${String(Math.round(mins % 60)).padStart(2, '0')}`
      : null;
    let tss: number | null = null;
    if (mins != null && pace != null && pace > 0) {
      const parts = thresholdPace.split(':').map(Number);
      const threshMinKm = parts[0] + parts[1] / 60;
      const IF = threshMinKm / pace;                    // run: pace vs threshold
      tss = Math.round((mins / 60) * IF * IF * 100);
    } else if (mins != null && power != null && ftp && ftp > 0) {
      const IF = power / ftp;                            // ride: power vs FTP
      tss = Math.round((mins / 60) * IF * IF * 100);
    }
    completedMap[cw.plan_session_id] = {
      durationStr: durationStr ?? '',
      durationMins: mins,
      distanceKm: cw.actual_distance_km != null ? Number(cw.actual_distance_km) : null,
      tss,
      avgHr: cw.actual_avg_hr != null ? Number(cw.actual_avg_hr) : null,
      avgPower: power,
      segmentActuals: (cw.segment_actuals as (number | null)[] | null) ?? null,
      segmentHr: (cw.segment_hr as (number | null)[] | null) ?? null,
    };
  }

  // Activities merged into a completion (a ride Strava split in two) → shown under
  // the session with an unmerge control. Resolve their display names.
  const mergedBySession: Record<string, { stravaId: number; name: string | null }[]> = {};
  const allMergedIds: number[] = [];
  for (const cw of completed ?? []) {
    const ids = ((cw.merged_strava_ids as number[] | null) ?? []).map(Number).filter(Boolean);
    if (cw.plan_session_id && ids.length) {
      mergedBySession[cw.plan_session_id as string] = ids.map(id => ({ stravaId: id, name: null }));
      allMergedIds.push(...ids);
    }
  }
  if (allMergedIds.length) {
    const names = new Map((await getActivityNamesByStravaIds(allMergedIds)).map(n => [n.stravaActivityId, n.name]));
    for (const list of Object.values(mergedBySession)) {
      for (const m of list) m.name = names.get(m.stravaId) ?? null;
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
  // same intra-day order the rows render in (so it lands on whatever genuinely
  // comes first that day, e.g. strength before the run on strength-priority plans).
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
      // Same day: chronological (warm-up → run → stretch → core → strength), or
      // strength-first on strength-priority plans.
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

  // Off-plan activities (synced but unmatched) within the plan range, bucketed by
  // date. Run TSS is derived from pace; rides/strength carry none.
  const offPlanByDate: Record<string, OffPlanActivity[]> = {};
  if (planStart) {
    const tp = thresholdPace.split(':').map(Number);
    const threshMinKm = tp[0] + (tp[1] || 0) / 60;
    for (const a of await listOffPlanActivitiesBetween(planStart, todayStr)) {
      if (activityKind(a.activityType) === 'run' && a.durationMins != null && a.avgPaceMinKm && a.avgPaceMinKm > 0) {
        const IF = threshMinKm / a.avgPaceMinKm;
        a.tss = Math.round((a.durationMins / 60) * IF * IF * 100);
      }
      (offPlanByDate[a.date] ??= []).push(a);
    }
  }

  const planBlock = (p: PlanRow) => (
    <RaceBlock
      name={p.name}
      kind={p.kind}
      raceDate={p.race_date}
      startDate={p.start_date}
      endDate={p.end_date}
      distanceKm={p.distance_km}
      targetTime={p.target_time}
      targetPace={p.target_pace}
      slug={p.slug}
    />
  );

  const phaseBar = phaseSegments.length > 0 && (
    <div className="border border-fog rounded-[16px] bg-paper px-[15px] py-[14px] mb-5">
      <PhaseBar segments={phaseSegments} todayPct={todayPct} />
    </div>
  );

  // Plans for the header dropdown — the live plan (→ /plan) then upcoming plans.
  const archivedCount = withStatus.filter(p => p.status === 'archived').length;
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

  const weeksSection = (
    <>
      {phaseBar}
      <div className="font-mono text-[11px] font-semibold uppercase tracking-[.13em] text-stone mb-[6px]">Weeks</div>
      <PlanThread
        weeks={viewWeeks}
        byWeek={byWeek}
        offPlanByDate={offPlanByDate}
        manualMatches={manualMatches}
        mergedBySession={mergedBySession}
        todayStr={todayStr}
        completedMap={completedMap}
        nextSessionId={nextSessionId}
        thresholdPace={thresholdPace}
        zones={zones}
        hrZones={hrZones}
        powerZones={powerZones}
        bikeHrZones={bikeHrZones}
      />
    </>
  );

  const notBuilt = (
    <div className="mt-6 border border-fog rounded-[14px] bg-paper px-[22px] py-[44px] text-center">
      <p className="text-stone text-[15px]">This plan hasn&apos;t been built yet.</p>
    </div>
  );

  return (
    <div className="px-4 py-4 sm:px-[26px] sm:py-[22px] max-w-[1040px]">

      {planOptions.length > 0 && (
        <PlanSwitcher
          currentName={viewPlan?.name ?? 'Select a plan'}
          currentSlug={selectedPlan ? selectedPlan.slug : null}
          options={planOptions}
          archiveCount={archivedCount}
        />
      )}

      {viewPlan ? (
        <>
          {planBlock(viewPlan)}
          <div className="mt-6">
            {viewWeeks.length > 0 ? weeksSection : notBuilt}
          </div>
        </>
      ) : (
        <div className="mt-6 border border-fog rounded-[14px] bg-paper px-[22px] py-[44px] text-center">
          <p className="text-stone text-[15px]">No active plan right now — pick one from the menu above.</p>
        </div>
      )}

    </div>
  );
}
