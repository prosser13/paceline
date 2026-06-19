import AppShell from '@/components/AppShell';
import ProfileChart from '@/components/ProfileChart';
import { buildProfileBars } from '@/lib/profile';
import { normalizeStructure } from '@/lib/plan-structure';
import type { ZoneMap } from '@/lib/plan-structure';
import {
  INTENSITY, MetricBlock, WorkoutDetail, syntheticStructure, sumSegmentSeconds, fmtHMM,
} from '@/components/session-ui';
import ExpandableSessionRow from './ExpandableSessionRow';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createClient } from '@/lib/supabase-server';
import { getFitnessForm } from '@/lib/intervals';

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

function formatDay(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return {
    short: d.toLocaleDateString('en-GB', { weekday: 'short' }),
    long:  d.toLocaleDateString('en-GB', { weekday: 'long' }),
    date:  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    full:  d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }),
  };
}

function greet() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const firstName = (user?.user_metadata?.full_name as string | undefined)?.split(' ')[0] ?? '';

  const today     = new Date();
  const todayStr  = isoDate(today);
  const todayFull = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  // Today's session
  const { data: todaySessions } = await supabaseAdmin
    .from('plan_sessions')
    .select('*')
    .eq('scheduled_date', todayStr)
    .order('am_pm', { ascending: true });

  const todaySession = (todaySessions?.[0] ?? null) as PlanSession | null;

  // Tomorrow's session — its own hero card
  const tomorrowStr = isoDate(addDays(today, 1));
  const { data: tomorrowSessions } = await supabaseAdmin
    .from('plan_sessions')
    .select('*')
    .eq('scheduled_date', tomorrowStr)
    .order('am_pm', { ascending: true });
  const tomorrowSession = (tomorrowSessions?.[0] ?? null) as PlanSession | null;

  // Coming up — the days after tomorrow
  const { data: upcoming } = await supabaseAdmin
    .from('plan_sessions')
    .select('*')
    .gt('scheduled_date', tomorrowStr)
    .lte('scheduled_date', isoDate(addDays(today, 7)))
    .order('scheduled_date', { ascending: true })
    .order('am_pm', { ascending: true });

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
  const { data: recent } = await supabaseAdmin
    .from('completed_workouts')
    .select('actual_distance_km, actual_duration_mins')
    .gte('completed_date', isoDate(addDays(today, -7)))
    .lte('completed_date', todayStr);

  const totalKm   = recent?.reduce((s, w) => s + (w.actual_distance_km ?? 0), 0) ?? 0;
  const totalMins = recent?.reduce((s, w) => s + (w.actual_duration_mins ?? 0), 0) ?? 0;
  const sessions  = recent?.length ?? 0;
  const h = Math.floor(totalMins / 60);
  const m = Math.round(totalMins % 60);

  // Threshold pace for profile chart effort calculation
  const { data: appConfig } = await supabaseAdmin
    .from('app_config')
    .select('threshold_pace_per_km')
    .limit(1)
    .maybeSingle();
  const thresholdPace = appConfig?.threshold_pace_per_km ?? '3:40';

  // Is today's session already completed (matched to a Strava activity)?
  let todayCompleted: {
    durationStr: string; mins: number | null; tss: number | null; distanceKm: number | null;
    segmentActuals: (number | null)[] | null;
  } | null = null;
  if (todaySession) {
    const { data: cw } = await supabaseAdmin
      .from('completed_workouts')
      .select('actual_duration_mins, actual_avg_pace_min_km, actual_distance_km, segment_actuals')
      .eq('plan_session_id', todaySession.id)
      .maybeSingle();
    if (cw) {
      const mins = cw.actual_duration_mins ? Number(cw.actual_duration_mins) : null;
      const pace = cw.actual_avg_pace_min_km ? Number(cw.actual_avg_pace_min_km) : null;
      const durationStr = mins != null
        ? `${Math.floor(mins / 60)}:${String(Math.round(mins % 60)).padStart(2, '0')}`
        : '';
      let tss: number | null = null;
      if (mins != null && pace != null && pace > 0) {
        const parts = thresholdPace.split(':').map(Number);
        const threshMinKm = parts[0] + parts[1] / 60;
        const IF = threshMinKm / pace;
        tss = Math.round((mins / 60) * IF * IF * 100);
      }
      todayCompleted = {
        durationStr, mins, tss,
        distanceKm: cw.actual_distance_km ? Number(cw.actual_distance_km) : null,
        segmentActuals: (cw.segment_actuals as (number | null)[] | null) ?? null,
      };
    }
  }

  // Pace zones — paces/times across the dashboard derive from these (same as the plan page)
  const { data: paceZones } = await supabaseAdmin.from('pace_zones').select('*').order('sort_order');
  const zones: ZoneMap = {};
  for (const z of paceZones ?? []) {
    zones[z.zone_key] = { key: z.zone_key, name: z.name, paceMin: z.pace_min, paceMax: z.pace_max, sortOrder: z.sort_order };
  }

  // Fitness / fatigue / form from intervals.icu (null if unconfigured or API down)
  const fitnessForm = await getFitnessForm();

  // Current week from plan_weeks
  const { data: weekRow } = await supabaseAdmin
    .from('plan_weeks')
    .select('*')
    .lte('date_from', todayStr)
    .gte('date_to', todayStr)
    .single();

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
          {/* Block banner */}
          <div className="flex flex-col gap-2 border border-fog rounded-[14px] bg-paper p-[15px_18px]">
            {weekRow ? (
              <>
                <span className="font-mono text-[13px] tracking-[.12em] uppercase text-oxblood">
                  {weekRow.phase} · Week {weekRow.week_number}
                </span>
                {weekRow.purpose && (
                  <p className="text-[15.5px] text-ink m-0">{weekRow.purpose}</p>
                )}
                <span className="font-mono text-[13px] text-stone mt-auto">
                  {weekRow.planned_volume_km} km planned this week
                </span>
              </>
            ) : (
              <>
                <span className="font-mono text-[13px] tracking-[.12em] uppercase text-stone">Plan</span>
                <p className="text-[15.5px] text-stone m-0">
                  Plan starts 17 Aug 2026 · Pfitz 12/70
                </p>
                <span className="font-mono text-[13px] text-stone mt-auto">
                  Marathon — 8 Nov 2026
                </span>
              </>
            )}
          </div>

          {/* Status card — live intervals.icu fitness/fatigue/form */}
          <div className="flex flex-col border border-fog rounded-[14px] bg-fern-soft p-[15px_18px]">
            <span className="font-mono text-[13px] tracking-[.12em] uppercase text-fern">
              Current status · intervals.icu
            </span>
            {fitnessForm ? (
              <>
                <div className="font-display font-semibold text-[28px] text-fern my-[3px_2px]">
                  {fitnessForm.form > 0 ? '+' : ''}{fitnessForm.form}
                </div>
                <p className="text-[15px] text-ink mb-[10px]">{formLabel(fitnessForm.form)}</p>
                <div className="mt-auto font-mono text-[14px] text-ink flex gap-[14px] border-t border-fog pt-[9px]">
                  <span>Fitness <b className="text-marine">{fitnessForm.fitness}</b></span>
                  <span>Fatigue <b className="text-marine">{fitnessForm.fatigue}</b></span>
                  <span>Form <b className="text-marine">{fitnessForm.form > 0 ? '+' : ''}{fitnessForm.form}</b></span>
                </div>
              </>
            ) : (
              <>
                <div className="font-display font-semibold text-[28px] text-fern my-[3px_2px]">—</div>
                <p className="text-[15px] text-ink mb-[10px]">
                  Connect intervals.icu in Settings to see your fitness, fatigue &amp; form.
                </p>
                <div className="mt-auto font-mono text-[14px] text-ink flex gap-[14px] border-t border-fog pt-[9px]">
                  <span>Fitness <b className="text-marine">—</b></span>
                  <span>Fatigue <b className="text-marine">—</b></span>
                  <span>Form <b className="text-marine">—</b></span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Today hero */}
        {todaySession ? (
          <SessionHero label="Today" session={todaySession} thresholdPace={thresholdPace} zones={zones} completed={todayCompleted} />
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
          <SessionHero label="Tomorrow" session={tomorrowSession} thresholdPace={thresholdPace} zones={zones} completed={null} />
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
                <ExpandableSessionRow key={s.id} session={s} thresholdPace={thresholdPace} zones={zones} />
              ))}
            </div>
          </div>
        )}

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
                { k: 'Training load', v: '—',                      unit: 'TSS' },
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

// Interpret TSB / form per the usual intervals.icu bands.
function formLabel(form: number): string {
  if (form > 5)    return 'Fresh — well rested';
  if (form >= -10) return 'Neutral — balanced load';
  if (form >= -30) return 'Productive — building fitness';
  return 'Fatigued — ease off soon';
}

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

function VsStat({ label, value, delta, deltaClass }: {
  label: string; value: string; delta: string | null; deltaClass: string;
}) {
  return (
    <div className="text-right">
      <div className="font-mono text-[10px] uppercase tracking-[.08em] text-stone">{label}</div>
      <div className="font-mono text-[15px] text-ink leading-tight mt-[2px]">{value}</div>
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
  label, session, thresholdPace, zones, completed,
}: {
  label: 'Today' | 'Tomorrow';
  session: PlanSession;
  thresholdPace: string;
  zones: ZoneMap;
  completed: { durationStr: string; mins: number | null; tss: number | null; distanceKm: number | null; segmentActuals: (number | null)[] | null } | null;
}) {
  const d         = formatDay(session.scheduled_date);
  const intensity = (session.intensity as string | null) ?? 'easy';
  const segActuals = completed?.segmentActuals ?? null;
  const steps     = normalizeStructure(
    session.structure?.length ? session.structure : syntheticStructure(session, intensity),
    zones,
    segActuals,
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

  return (
    <div className="border border-fog rounded-[18px] overflow-hidden bg-paper mb-[18px]">
      {/* Full-width coloured header bar */}
      <div className="flex items-center justify-between px-[26px] py-[12px]" style={{ background: accent.solid, color: BONE }}>
        <span className="font-display font-semibold text-[18px] uppercase tracking-[.05em] leading-none">{label}</span>
        <div className="flex items-center gap-[12px] font-mono text-[13px]">
          <span style={{ opacity: 0.8 }}>{d.long}</span>
          {isDone && <span>✓ Completed</span>}
        </div>
      </div>

      <div className="p-[22px_26px]">
      <div className="flex justify-between items-start gap-6">
        <div className="min-w-0">
          <h3 className="font-display font-semibold text-[30px] mt-[1px] mb-[5px] leading-tight">
            {session.name}
          </h3>
          {session.description && (
            <div className="text-[15px] text-stone">{session.description}</div>
          )}
        </div>
        <div className="flex flex-col items-end gap-[14px] shrink-0">
          <div className="flex items-center gap-4">
            <ProfileChart
              bars={buildProfileBars(session, thresholdPace, zones, segActuals)}
              size="lg"
              color={INTENSITY[intensity]?.hex ?? '#17191e'}
              opacity={segActuals ? 0.9 : 0.6}
            />
            <MetricBlock
              duration={displayDuration}
              distanceKm={isDone ? distActual : distPlanned}
              tss={displayTss}
              estimated={!isDone}
              size="lg"
            />
          </div>

          {isDone && (
            <div className="border-t border-fog pt-[10px] w-full">
              <div className="font-mono text-[10px] uppercase tracking-[.12em] text-stone mb-[7px] text-right">
                Vs planned
              </div>
              <div className="flex gap-[20px] justify-end">
                <VsStat
                  label="Distance"
                  value={distActual != null ? `${distActual.toFixed(1)} km` : '—'}
                  delta={distDelta != null ? `${distDelta >= 0 ? '+' : '−'}${Math.abs(distDelta).toFixed(1)} km` : null}
                  deltaClass={devClass(distDelta != null && distPlanned ? distDelta / distPlanned : null)}
                />
                <VsStat
                  label="Time"
                  value={displayDuration ?? '—'}
                  delta={timeDelta != null ? signedTime(timeDelta) : null}
                  deltaClass={devClass(timeDelta != null && plannedMins ? timeDelta / plannedMins : null)}
                />
                <VsStat
                  label="Load"
                  value={tssActual != null ? `${tssActual} TSS` : '—'}
                  delta={tssDelta != null ? `${tssDelta >= 0 ? '+' : '−'}${Math.abs(tssDelta)}` : null}
                  deltaClass={devClass(tssDelta != null && tssPlanned ? tssDelta / tssPlanned : null)}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {session.rationale && (
        <p className={`text-[16.5px] leading-relaxed mt-[14px] border-l-[3px] pl-[14px] max-w-[64ch] text-ink ${accent.rail}`}>
          {session.rationale}
        </p>
      )}

      {steps.length > 0 && (
        <div className="mt-[18px]">
          <p className="font-mono text-[13px] tracking-[.12em] uppercase text-stone mb-[9px]">The session</p>
          <WorkoutDetail steps={steps} variant="card" />
        </div>
      )}

      {isDone ? (
        <div className="mt-[18px] font-mono text-[13px] text-stone">Logged from Strava</div>
      ) : label === 'Today' ? (
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
      ) : null}
      </div>
    </div>
  );
}

