export const dynamic = 'force-dynamic';

import AppShell from '@/components/AppShell';
import { supabaseAdmin } from '@/lib/supabase-admin';
import WeekAccordion from './WeekAccordion';
import RaceBlock from './RaceBlock';
import PastWeeksAccordion from './PastWeeksAccordion';
import type { ZoneMap, HrZoneMap } from '@/lib/plan-structure';

interface PlanSession {
  id: string;
  week_number: number;
  session_type: string;
  name: string;
  description?: string | null;
  distance_km?: number | null;
  scheduled_date: string;
  status?: string | null;
  intensity?: string | null;
  estimated_tss?: number | null;
  estimated_duration?: string | null;
  target_pace?: string | null;
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

const PHASE_COLOR: Record<string, { bar: string; label: string }> = {
  Base:  { bar: 'bg-marine',  label: 'text-marine'     },
  Build: { bar: 'bg-amber',   label: 'text-amber-dark'  },
  Peak:  { bar: 'bg-ember',   label: 'text-ember'      },
  Taper: { bar: 'bg-fern',    label: 'text-fern'       },
};

function shortDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
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

  const [{ data: sessions }, { data: weeks }, { data: config }, { data: completed }, { data: paceZones }, { data: hrZonesRows }, { data: plans }] = await Promise.all([
    supabaseAdmin.from('plan_sessions').select('*').order('scheduled_date').order('am_pm'),
    supabaseAdmin.from('plan_weeks').select('*').order('week_number'),
    supabaseAdmin.from('app_config').select('threshold_pace_per_km').limit(1).maybeSingle(),
    supabaseAdmin.from('completed_workouts').select('plan_session_id, actual_distance_km, actual_duration_mins, actual_avg_pace_min_km, actual_avg_hr, segment_actuals, segment_hr'),
    supabaseAdmin.from('pace_zones').select('*').order('sort_order'),
    supabaseAdmin.from('hr_zones').select('*').order('sort_order'),
    supabaseAdmin.from('plans').select('*').order('sort_order'),
  ]);

  const thresholdPace = config?.threshold_pace_per_km ?? '3:40';
  const allSessions   = (sessions ?? []) as PlanSession[];
  const allWeeks      = (weeks   ?? []) as PlanWeek[];

  const zones: ZoneMap = {};
  for (const z of paceZones ?? []) {
    zones[z.zone_key] = { key: z.zone_key, name: z.name, paceMin: z.pace_min, paceMax: z.pace_max, sortOrder: z.sort_order };
  }

  const hrZones: HrZoneMap = {};
  for (const z of hrZonesRows ?? []) {
    hrZones[z.zone_key] = { min: z.hr_min, max: z.hr_max };
  }

  // Build map of plan_session_id → actual display values for done sessions
  const completedMap: Record<string, { durationStr: string; distanceKm: number | null; tss: number | null; avgHr: number | null; segmentActuals: (number | null)[] | null; segmentHr: (number | null)[] | null }> = {};
  for (const cw of completed ?? []) {
    if (!cw.plan_session_id) continue;
    const mins  = cw.actual_duration_mins ? Number(cw.actual_duration_mins) : null;
    const pace  = cw.actual_avg_pace_min_km ? Number(cw.actual_avg_pace_min_km) : null;
    const durationStr = mins != null
      ? `${Math.floor(mins / 60)}:${String(Math.round(mins % 60)).padStart(2, '0')}`
      : null;
    let tss: number | null = null;
    if (mins != null && pace != null && pace > 0) {
      const parts = thresholdPace.split(':').map(Number);
      const threshMinKm = parts[0] + parts[1] / 60;
      const IF = threshMinKm / pace;
      tss = Math.round((mins / 60) * IF * IF * 100);
    }
    completedMap[cw.plan_session_id] = {
      durationStr: durationStr ?? '',
      distanceKm: cw.actual_distance_km != null ? Number(cw.actual_distance_km) : null,
      tss,
      avgHr: cw.actual_avg_hr != null ? Number(cw.actual_avg_hr) : null,
      segmentActuals: (cw.segment_actuals as (number | null)[] | null) ?? null,
      segmentHr: (cw.segment_hr as (number | null)[] | null) ?? null,
    };
  }

  // First non-done, non-rest session in date order — used for next-up row highlight
  const nextSessionId = allSessions.find(s => {
    if (s.id in completedMap) return false;
    const st = s.status;
    if (st === 'rest' || st === 'skipped' || st === 'missed_injury') return false;
    return true;
  })?.id ?? null;

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
  const viewWeeks = viewPlan ? allWeeks.filter(w => w.plan_id === viewPlan.id) : [];

  const byWeek = allSessions.reduce<Record<number, PlanSession[]>>((acc, s) => {
    (acc[s.week_number] ??= []).push(s);
    return acc;
  }, {});

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
    wk.sort((a, b) => (a.scheduled_date < b.scheduled_date ? -1 : a.scheduled_date > b.scheduled_date ? 1 : 0));
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

  // Past weeks collapse into a single greyed accordion; current + future stay open
  const pastWeeks   = viewWeeks.filter(w => w.date_to < todayStr);
  const futureWeeks = viewWeeks.filter(w => w.date_to >= todayStr);
  const pastLabel = pastWeeks.length === 1
    ? `Week ${pastWeeks[0].week_number} · done`
    : pastWeeks.length > 1
      ? `Weeks ${pastWeeks[0].week_number}–${pastWeeks[pastWeeks.length - 1].week_number} · done`
      : '';

  const renderWeek = (week: PlanWeek) => (
    <WeekAccordion
      key={week.week_number}
      week={week}
      sessions={byWeek[week.week_number] ?? []}
      thresholdPace={thresholdPace}
      todayStr={todayStr}
      defaultOpen={week.date_from <= todayStr && week.date_to >= todayStr}
      completedMap={completedMap}
      nextSessionId={nextSessionId}
      zones={zones}
      hrZones={hrZones}
    />
  );

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
    />
  );

  const phaseBar = phaseSegments.length > 0 && (
    <div className="mb-7">
      <div className="flex flex-wrap items-center gap-x-[14px] gap-y-[6px] mb-[10px]">
        {phaseSegments.map((seg, i) => (
          <span key={i} className="flex items-center gap-[5px]">
            <i className={`inline-block w-[8px] h-[8px] rounded-[2px] ${PHASE_COLOR[seg.phase]?.bar ?? 'bg-stone'}`} />
            <span className={`font-mono text-[12px] tracking-[.1em] uppercase ${PHASE_COLOR[seg.phase]?.label ?? 'text-stone'}`}>
              {seg.phase}
            </span>
          </span>
        ))}
        {planStart && planEnd && (
          <span className="font-mono text-[12px] text-stone ml-auto">
            {shortDate(planStart)} – {shortDate(planEnd)}
          </span>
        )}
      </div>
      <div className="relative h-[6px] rounded-full bg-fog overflow-hidden">
        <div className="absolute inset-0 flex">
          {phaseSegments.map((seg, i) => (
            <div
              key={i}
              className={`h-full opacity-80 ${PHASE_COLOR[seg.phase]?.bar ?? 'bg-stone'}`}
              style={{ width: `${seg.pct}%` }}
            />
          ))}
        </div>
        {todayPct != null && (
          <div
            className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-oxblood rounded-full"
            style={{ left: `${todayPct}%` }}
          />
        )}
      </div>
    </div>
  );

  const weeksSection = (
    <>
      {phaseBar}
      <div className="flex flex-col gap-[10px]">
        {pastWeeks.length > 0 && (
          <PastWeeksAccordion label={pastLabel}>
            {pastWeeks.map(renderWeek)}
          </PastWeeksAccordion>
        )}
        {futureWeeks.map(renderWeek)}
      </div>
    </>
  );

  const notBuilt = (
    <div className="mt-6 border border-fog rounded-[14px] bg-paper px-[22px] py-[44px] text-center">
      <p className="text-stone text-[15px]">This plan hasn&apos;t been built yet.</p>
    </div>
  );

  return (
    <AppShell>
      <div className="px-[26px] py-[22px] max-w-[1040px]">

      {selectedPlan ? (
        // A specific plan was requested via ?plan=slug
        <>
          {planBlock(selectedPlan)}
          <div className="mt-6">
            {viewWeeks.length > 0 ? weeksSection : notBuilt}
          </div>
        </>
      ) : (
        // Default view: active plan + its weeks, then future-plan teasers
        <>
          {activePlan && <div className="mb-6">{planBlock(activePlan)}</div>}
          {viewWeeks.length > 0 ? weeksSection : (!activePlan && notBuilt)}
          {futurePlans.map(p => (
            <div key={p.id} className="mt-8">{planBlock(p)}</div>
          ))}
        </>
      )}

      </div>
    </AppShell>
  );
}
