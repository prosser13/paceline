import AppShell from '@/components/AppShell';
import ProfileChart from '@/components/ProfileChart';
import { buildProfileBars } from '@/lib/profile';
import { normalizeStructure } from '@/lib/plan-structure';
import type { ZoneMap, HrZoneMap } from '@/lib/plan-structure';
import {
  INTENSITY, MetricBlock, syntheticStructure, sumSegmentSeconds, fmtHMM, fmtMMSS, wholeRunActuals,
} from '@/components/session-ui';
import CollapsibleSession from './CollapsibleSession';
import ExpandableSessionRow from './ExpandableSessionRow';
import {
  PhaseTimeline, FormMeter, CountdownRing, WeeklyBars, FitnessChart,
  type PhaseSeg, type WeekDay,
} from '@/components/dashboard-graphics';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createClient } from '@/lib/supabase-server';
import { getWellnessCached } from '@/lib/intervals';

export const dynamic = 'force-dynamic';

interface PlanSession {
  id: string;
  scheduled_date: string;
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

function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isoDate(d: Date) {
  return d.toISOString().split('T')[0];
}

function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  while (d <= end) {
    out.push(isoDate(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function greet() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const today       = new Date();
  const todayStr    = isoDate(today);
  const tomorrowStr = isoDate(addDays(today, 1));
  const weekAgoStr  = isoDate(addDays(today, -7));
  const weekEndStr  = isoDate(addDays(today, 7));
  const todayFull   = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  // ── Tier 1 — every query with no dependency on another, fired in parallel ──
  const [
    { data: { user } },
    { data: todaySessions },
    { data: tomorrowSessions },
    { data: upcoming },
    { data: recent },
    { data: appConfig },
    { data: paceZones },
    { data: hrZoneRows },
    { data: weekRow },
    { data: raceRow },
    wellness,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabaseAdmin.from('plan_sessions').select('*').eq('scheduled_date', todayStr).order('am_pm', { ascending: true }),
    supabaseAdmin.from('plan_sessions').select('*').eq('scheduled_date', tomorrowStr).order('am_pm', { ascending: true }),
    supabaseAdmin.from('plan_sessions').select('*')
      .gt('scheduled_date', tomorrowStr).lte('scheduled_date', weekEndStr)
      .order('scheduled_date', { ascending: true }).order('am_pm', { ascending: true }),
    supabaseAdmin.from('completed_workouts')
      .select('actual_distance_km, actual_duration_mins, actual_avg_pace_min_km')
      .gte('completed_date', weekAgoStr).lte('completed_date', todayStr),
    supabaseAdmin.from('app_config').select('threshold_pace_per_km').limit(1).maybeSingle(),
    supabaseAdmin.from('pace_zones').select('*').order('sort_order'),
    supabaseAdmin.from('hr_zones').select('*').order('sort_order'),
    supabaseAdmin.from('plan_weeks').select('*').lte('date_from', todayStr).gte('date_to', todayStr).single(),
    supabaseAdmin.from('plans').select('name, race_date')
      .eq('kind', 'race').gte('race_date', todayStr)
      .order('race_date', { ascending: true }).limit(1).maybeSingle(),
    getWellnessCached(),
  ]);

  const firstName = (user?.user_metadata?.full_name as string | undefined)?.split(' ')[0] ?? '';
  const todaySession    = (todaySessions?.[0] ?? null) as PlanSession | null;
  const tomorrowSession = (tomorrowSessions?.[0] ?? null) as PlanSession | null;
  const fitnessForm    = wellness.form;
  const fitnessHistory = wellness.history;

  // Threshold pace for profile chart effort + TSS calculations
  const thresholdPace = appConfig?.threshold_pace_per_km ?? '3:40';
  const threshParts   = thresholdPace.split(':').map(Number);
  const threshMinKm   = threshParts[0] + (threshParts[1] || 0) / 60;

  // Pace zones — paces/times across the dashboard derive from these (same as the plan page)
  const zones: ZoneMap = {};
  for (const z of paceZones ?? []) {
    zones[z.zone_key] = { key: z.zone_key, name: z.name, paceMin: z.pace_min, paceMax: z.pace_max, sortOrder: z.sort_order };
  }

  // HR zones — target HR windows shown per segment
  const hrZones: HrZoneMap = {};
  for (const z of hrZoneRows ?? []) {
    hrZones[z.zone_key] = { min: z.hr_min, max: z.hr_max };
  }

  // Fill empty days with rest days (render-only, not persisted)
  const upcomingReal = (upcoming ?? []) as PlanSession[];
  const byDate = new Map<string, PlanSession[]>();
  for (const s of upcomingReal) {
    const list = byDate.get(s.scheduled_date) ?? [];
    list.push(s);
    byDate.set(s.scheduled_date, list);
  }
  const upcomingWithRest: PlanSession[] = [];
  for (let i = 2; i <= 7; i++) {
    const date = isoDate(addDays(today, i));
    const daySessions = byDate.get(date);
    if (daySessions?.length) {
      upcomingWithRest.push(...daySessions);
    } else {
      upcomingWithRest.push({ id: `rest-${date}`, scheduled_date: date, name: 'Rest', status: 'rest' } as PlanSession);
    }
  }

  // Last 7 days stats
  const totalKm   = recent?.reduce((s, w) => s + (w.actual_distance_km ?? 0), 0) ?? 0;
  const totalMins = recent?.reduce((s, w) => s + (w.actual_duration_mins ?? 0), 0) ?? 0;
  const sessions  = recent?.length ?? 0;
  const h = Math.floor(totalMins / 60);
  const m = Math.round(totalMins % 60);

  // 7-day training load = Σ TSS (duration × IF², IF = threshold ÷ actual pace)
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

  // Countdown to the next upcoming A-race (currently Dragon 50; rolls over to
  // the next race automatically once it has been run).
  let daysToRace: number | null = null;
  if (raceRow?.race_date) {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    daysToRace = Math.ceil((new Date(raceRow.race_date + 'T00:00:00').getTime() - t.getTime()) / 86400000);
  }
  const raceName = (raceRow?.name as string | null) ?? null;
  const raceDateStr = raceRow?.race_date
    ? new Date(raceRow.race_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : null;

  // ── Tier 2 — queries that depend on Tier 1 results, fired in parallel ──
  const [{ data: cw }, weekData, { data: planWeeks }] = await Promise.all([
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
    planId
      ? supabaseAdmin.from('plan_weeks').select('phase, date_from, date_to, week_number')
          .eq('plan_id', planId).order('week_number')
      : Promise.resolve({ data: null }),
  ]);

  // Is today's session already completed (matched to a Strava activity)?
  let todayCompleted: {
    durationStr: string; mins: number | null; tss: number | null; distanceKm: number | null;
    avgHr: number | null;
    segmentActuals: (number | null)[] | null;
    segmentHr: (number | null)[] | null;
  } | null = null;
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

  // Planned km this week — actual sum of the full week's sessions (not the stored
  // estimate) — plus per-day volume and completed-so-far for the graphical panels.
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
      const d = new Date(date + 'T00:00:00');
      const label = ['M', 'T', 'W', 'T', 'F', 'S', 'S'][(d.getDay() + 6) % 7];
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

  // Phase timeline — merge consecutive same-phase weeks of the active plan into
  // proportional segments; mark today's position along the block.
  const phaseSegments: PhaseSeg[] = [];
  let todayPct: number | null = null;
  let ringPct = 0;
  {
    const wks = planWeeks ?? [];
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
      ringPct = 100 - todayPct; // proportion of the block still to run
    }
  }

  return (
    <AppShell>
      <div className="px-[26px] py-[22px] max-w-[1040px]">

        {/* Date + greeting */}
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-display font-semibold text-[22px]">{todayFull}</h2>
          {firstName && (
            <span className="font-mono text-[14px] text-stone">{greet()}, {firstName}</span>
          )}
        </div>

        {/* Context row */}
        <div className="grid grid-cols-[1.5fr_1fr] gap-[14px] mb-5">
          {/* Block banner — phase timeline */}
          {weekRow ? (
            <PhaseTimeline
              headerLabel={weekLabel}
              purpose={weekPurpose}
              segments={phaseSegments}
              todayPct={todayPct}
              daysToRace={daysToRace}
              raceName={raceName}
              raceDateStr={raceDateStr}
            />
          ) : (
            <div className="flex flex-col border border-fog rounded-[14px] overflow-hidden bg-paper">
              <div className="px-[18px] py-[10px]" style={{ background: '#8c2b2b', color: BONE }}>
                <span className="font-mono text-[12px] uppercase tracking-[.14em] leading-none">Plan</span>
              </div>
              <div className="flex flex-col gap-2 px-[18px] py-[15px] flex-1">
                <p className="text-[15.5px] text-stone m-0">Plan starts 17 Aug 2026 · Pfitz 12/70</p>
                <span className="font-mono text-[13px] text-stone mt-auto">Marathon — 8 Nov 2026</span>
              </div>
            </div>
          )}

          {/* Status card — live intervals.icu form meter */}
          <FormMeter
            form={fitnessForm?.form ?? null}
            fitness={fitnessForm?.fitness ?? null}
            fatigue={fitnessForm?.fatigue ?? null}
          />
        </div>

        {/* Today hero */}
        {todaySession ? (
          <SessionHero label="Today" session={todaySession} thresholdPace={thresholdPace} zones={zones} hrZones={hrZones} completed={todayCompleted} />
        ) : (
          <div className="border border-fog rounded-[18px] overflow-hidden bg-paper mb-[18px]">
            <div className="px-[26px] py-[12px]" style={{ background: '#8c2b2b', color: BONE }}>
              <span className="font-display font-semibold text-[18px] uppercase tracking-[.05em]">Today</span>
            </div>
            <p className="text-stone text-[16px] px-[26px] py-[18px]">No session scheduled — rest day.</p>
          </div>
        )}

        {/* Tomorrow hero */}
        {tomorrowSession ? (
          <SessionHero label="Tomorrow" session={tomorrowSession} thresholdPace={thresholdPace} zones={zones} hrZones={hrZones} completed={null} />
        ) : (
          <div className="border border-fog rounded-[18px] overflow-hidden bg-paper mb-[18px]">
            <div className="px-[26px] py-[12px]" style={{ background: '#14617e', color: BONE }}>
              <span className="font-display font-semibold text-[18px] uppercase tracking-[.05em]">Tomorrow</span>
            </div>
            <p className="text-stone text-[16px] px-[26px] py-[18px]">No session scheduled — rest day.</p>
          </div>
        )}

        {/* Coming up */}
        {upcomingWithRest.length > 0 && (
          <div className="mb-6 mt-6">
            <p className="font-mono text-[13px] tracking-[.12em] uppercase text-stone mb-[10px] m-0">
              Coming up
            </p>
            <div className="border border-fog rounded-[14px] bg-paper overflow-hidden divide-y divide-fog/50">
              {upcomingWithRest.map(s => (
                <ExpandableSessionRow key={s.id} session={s} thresholdPace={thresholdPace} zones={zones} hrZones={hrZones} />
              ))}
            </div>
          </div>
        )}

        {/* At a glance — graphical panels */}
        <div className="mb-6 mt-2">
          <p className="font-mono text-[13px] tracking-[.12em] uppercase text-stone mb-[10px]">At a glance</p>
          <div className="grid grid-cols-2 gap-[14px]">
            <CountdownRing
              headerLabel={weekLabel}
              purpose={weekPurpose}
              daysToRace={daysToRace}
              ringPct={ringPct}
              weekPlannedKm={weekPlannedKm}
              weekDoneKm={weekDoneKm}
            />
            <WeeklyBars
              headerLabel={weekLabel}
              days={weekDays}
              weekDoneKm={weekDoneKm}
              weekPlannedKm={weekPlannedKm}
              daysToRace={daysToRace}
              raceName={raceName}
            />
            <div className="col-span-2">
              <FitnessChart
                history={fitnessHistory}
                form={fitnessForm?.form ?? null}
                fitness={fitnessForm?.fitness ?? null}
                fatigue={fitnessForm?.fatigue ?? null}
              />
            </div>
          </div>
        </div>

        {/* Last 7 days */}
        {sessions > 0 && (
          <div>
            <p className="font-mono text-[13px] tracking-[.12em] uppercase text-stone mb-[10px]">
              Last 7 days
            </p>
            <div className="grid grid-cols-4 gap-[10px]">
              {[
                { k: 'Distance',      v: `${totalKm.toFixed(1)}`, unit: 'km' },
                { k: 'Sessions',      v: `${sessions}`,            unit: 'runs' },
                { k: 'Time',          v: `${h}:${String(m).padStart(2,'0')}`, unit: 'h:m' },
                { k: 'Training load', v: totalTss > 0 ? `${totalTss}` : '—', unit: 'TSS' },
              ].map(({ k, v, unit }) => (
                <div key={k} className="border border-fog rounded-[12px] bg-paper p-[13px_15px]">
                  <div className="font-mono text-[13px] tracking-[.08em] uppercase text-stone">{k}</div>
                  <div className="font-display font-semibold text-[22px] mt-[5px]">
                    {v} <small className="font-sans font-normal text-[14px] text-stone">{unit}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!todaySession && (upcoming?.length ?? 0) === 0 && (
          <div className="text-center py-16">
            <p className="text-stone mb-4">No sessions loaded yet.</p>
            <a
              href="/admin/sessions/new"
              className="bg-oxblood text-bone text-[15.5px] font-medium px-4 py-2.5 rounded-[10px] hover:bg-oxblood-dark transition-colors"
            >
              Add first session
            </a>
          </div>
        )}
      </div>
    </AppShell>
  );
}

/* ── Helpers ───────────────────────────────────────────────── */

// Magnitude-based delta colour (neutral when close to plan)
function devClass(pct: number | null): string {
  if (pct == null) return 'text-stone';
  const a = Math.abs(pct);
  if (a < 0.10) return 'text-stone';
  if (a < 0.20) return 'text-ember';
  return 'text-oxblood';
}

function signedTime(deltaMin: number): string {
  const sign   = deltaMin >= 0 ? '+' : '−';
  const absSec = Math.round(Math.abs(deltaMin) * 60);
  return `${sign}${Math.floor(absSec / 60)}:${String(absSec % 60).padStart(2, '0')}`;
}

function VsStat({ label, value, delta, deltaClass, align = 'right' }: {
  label: string; value: string; delta: string | null; deltaClass: string; align?: 'left' | 'right';
}) {
  return (
    <div className={align === 'left' ? 'text-left' : 'text-right'}>
      <div className="font-mono text-[10px] uppercase tracking-[.08em] text-stone">{label}</div>
      <div className="font-display font-semibold text-[20px] text-ink leading-tight mt-[2px]">{value}</div>
      {delta && <div className={`font-mono text-[12px] mt-[1px] ${deltaClass}`}>{delta}</div>}
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────── */

const BONE = '#f4efe4';

const HERO_ACCENT: Record<string, { rail: string; solid: string }> = {
  oxblood: { rail: 'border-l-oxblood', solid: '#8c2b2b' },
  marine:  { rail: 'border-l-marine',  solid: '#14617e' },
  fern:    { rail: 'border-l-fern',    solid: '#4f7a52' },
};

function SessionHero({
  label, session, thresholdPace, zones, hrZones, completed,
}: {
  label: 'Today' | 'Tomorrow';
  session: PlanSession;
  thresholdPace: string;
  zones: ZoneMap;
  hrZones: HrZoneMap;
  completed: { durationStr: string; mins: number | null; tss: number | null; distanceKm: number | null; avgHr: number | null; segmentActuals: (number | null)[] | null; segmentHr: (number | null)[] | null } | null;
}) {
  const intensity = (session.intensity as string | null) ?? 'easy';
  const { segActuals, segHr } = wholeRunActuals(
    !!session.structure?.length,
    completed
      ? { totalSeconds: completed.mins != null ? completed.mins * 60 : null, distanceKm: completed.distanceKm, avgHr: completed.avgHr }
      : null,
    completed?.segmentActuals ?? null,
    completed?.segmentHr ?? null,
  );
  const steps     = normalizeStructure(
    session.structure?.length ? session.structure : syntheticStructure(session, intensity),
    zones,
    segActuals,
    hrZones,
    segHr,
  );
  const plannedSec = sumSegmentSeconds(steps);
  const plannedDur = plannedSec > 0 ? fmtHMM(plannedSec) : session.estimated_duration ?? null;
  const isDone     = !!completed;
  const accent     = HERO_ACCENT[isDone ? 'fern' : label === 'Today' ? 'oxblood' : 'marine'];

  const displayDuration = isDone && completed!.durationStr ? completed!.durationStr : plannedDur;
  const displayTss      = isDone && completed!.tss != null ? completed!.tss : session.estimated_tss ?? null;

  // vs-plan deltas (completed only)
  const distPlanned = session.distance_km != null ? Number(session.distance_km) : null;
  const distActual  = completed?.distanceKm ?? null;
  const distDelta   = distActual != null && distPlanned != null ? distActual - distPlanned : null;

  const plannedMins = plannedSec > 0 ? plannedSec / 60 : null;
  const timeDelta   = completed?.mins != null && plannedMins != null ? completed.mins - plannedMins : null;

  const tssPlanned  = session.estimated_tss ?? null;
  const tssActual   = completed?.tss ?? null;
  const tssDelta    = tssActual != null && tssPlanned != null ? tssActual - tssPlanned : null;

  const avgPaceStr  = completed?.mins != null && completed?.distanceKm
    ? fmtMMSS((completed.mins * 60) / completed.distanceKm)
    : null;

  return (
    <div className="border border-fog rounded-[18px] overflow-hidden bg-paper mb-[18px]">
      {/* Full-width coloured header bar */}
      <div className="flex items-center justify-between px-[26px] py-[12px]" style={{ background: accent.solid, color: BONE }}>
        <span className="font-display font-semibold text-[18px] uppercase tracking-[.05em] leading-none">{label}</span>
        <div className="flex items-center gap-[12px] font-mono text-[13px]">
          {isDone && (
            <span className="flex items-center gap-[7px]">
              ✓ Completed
              <svg width="13" height="13" viewBox="0 0 24 24" fill={BONE} role="img" aria-label="Strava">
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
              </svg>
            </span>
          )}
        </div>
      </div>

      <div className="p-[22px_26px]">
      {isDone ? (
        <>
          {/* Title + profile, then a full-width stat strip (no wasted middle) */}
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <h3 className="font-display font-semibold text-[30px] mt-[1px] mb-[5px] leading-tight">
                {session.name}
              </h3>
              {session.description && (
                <div className="text-[15px] text-stone">{session.description}</div>
              )}
            </div>
            <ProfileChart
              bars={buildProfileBars(session, thresholdPace, zones, segActuals)}
              size="lg"
              color={INTENSITY[intensity]?.hex ?? '#17191e'}
              opacity={segActuals ? 0.9 : 0.6}
            />
          </div>
          <div className="grid grid-cols-5 gap-[14px] mt-[16px] pt-[14px] border-t border-fog">
            <VsStat align="left"
              label="Distance"
              value={distActual != null ? `${distActual.toFixed(1)} km` : '—'}
              delta={distDelta != null ? `${distDelta >= 0 ? '+' : '−'}${Math.abs(distDelta).toFixed(1)} km` : null}
              deltaClass={devClass(distDelta != null && distPlanned ? distDelta / distPlanned : null)}
            />
            <VsStat align="left"
              label="Time"
              value={displayDuration ?? '—'}
              delta={timeDelta != null ? signedTime(timeDelta) : null}
              deltaClass={devClass(timeDelta != null && plannedMins ? timeDelta / plannedMins : null)}
            />
            <VsStat align="left"
              label="Load"
              value={tssActual != null ? `${tssActual} TSS` : '—'}
              delta={tssDelta != null ? `${tssDelta >= 0 ? '+' : '−'}${Math.abs(tssDelta)}` : null}
              deltaClass={devClass(tssDelta != null && tssPlanned ? tssDelta / tssPlanned : null)}
            />
            <VsStat align="left" label="Avg pace" value={avgPaceStr ? `${avgPaceStr}/km` : '—'} delta={null} deltaClass="" />
            <VsStat align="left" label="Avg HR" value={completed?.avgHr != null ? `${completed.avgHr} bpm` : '—'} delta={null} deltaClass="" />
          </div>
        </>
      ) : (
        <div className="flex justify-between items-start gap-6">
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-[30px] mt-[1px] mb-[5px] leading-tight">
              {session.name}
            </h3>
            {session.description && (
              <div className="text-[15px] text-stone">{session.description}</div>
            )}
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <ProfileChart
              bars={buildProfileBars(session, thresholdPace, zones, segActuals)}
              size="lg"
              color={INTENSITY[intensity]?.hex ?? '#17191e'}
              opacity={segActuals ? 0.9 : 0.6}
            />
            <MetricBlock
              duration={displayDuration}
              distanceKm={distPlanned}
              tss={displayTss}
              estimated
              size="lg"
            />
          </div>
        </div>
      )}

      {session.rationale && (
        <p className={`text-[16.5px] leading-relaxed mt-[14px] border-l-[3px] pl-[14px] max-w-[64ch] text-ink ${accent.rail}`}>
          {session.rationale}
        </p>
      )}

      <CollapsibleSession steps={steps} defaultOpen={!isDone} />

      {!isDone && label === 'Today' && (
        <div className="mt-[18px]">
          <p className="font-mono text-[13px] tracking-[.12em] uppercase text-stone mb-[9px]">Adjust today</p>
          <div className="flex flex-wrap gap-2">
            {['Short on time', 'Legs feel flat', "Can't today"].map(chip => (
              <button
                key={chip}
                className="border border-fog bg-bone rounded-full px-[14px] py-[7px] text-[15px] text-ink cursor-pointer hover:border-stone transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

