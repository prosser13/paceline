// Run hero for the dashboard Today agenda + Recently-completed card. Server
// component. A dark hero whose summary shows the headline distance and the
// time/TSS/kcal stats (each carrying a plan-vs-actual delta once done); the
// expandable light panel keeps the "why", the intensity-profile graph, the
// fuel/fluid pills, and collapses the plan-vs-actual breakdown and the "Adjust
// today" options into aligned accordions.

import ProfileChart from '@/components/ProfileChart';
import { buildProfileBars } from '@/lib/profile';
import { normalizeStructure } from '@/lib/plan-structure';
import { computeExecutionScore, scoreColor } from '@/lib/execution-score';
import type { ZoneMap, HrZoneMap } from '@/lib/plan-structure';
import {
  INTENSITY, WorkoutDetail, CompareTable, HeroAccordion, heroDeltaColor, signedKcal, syntheticStructure, sumSegmentSeconds,
  fmtHMMSS, humanHMM, wholeRunActuals, buildRunCompare, isMergedRun, collapseToWholeRun,
} from '@/components/session-ui';
import { RunGlyph } from '@/components/glyphs';
import LongRunQuality from '@/components/LongRunQuality';
import LogNutritionRow from '@/components/LogNutritionRow';
import { LOW_FUEL_MAX_GPH } from '@/lib/fuel-progression';
import type { FuelProduct } from '@/data/fuel';
import { RUN, RUN_B, READY } from '@/lib/colors';
import type { PlanSession, CompletedToday } from './data';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// The short carbs-target label for the planned fuel pill (null when there's no
// gut-training guidance for this session).
function carbTargetLabel(session: PlanSession): string | null {
  const t = session.fuel_target;
  if (!t) return null;
  if (t.kind === 'progression' && t.gph != null) return `${t.gph} g/h`;
  if (t.kind === 'low_fuel') return `≤${LOW_FUEL_MAX_GPH} g/h`;
  return null;   // fasted_ok → no pill
}

function FuelPill({ kind, value, sub }: { kind: 'fuel' | 'fluid'; value: string; sub: string }) {
  const color = kind === 'fuel' ? '#c98a3a' : '#5aa0c4';
  const icon = kind === 'fuel'
    ? <path d="M13 2 4 14h6l-1 8 9-12h-6z" />
    : <path d="M10 2h4M9.5 5.5h5l.5 3.5v9a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V9z" />;
  return (
    <div className="flex-1 min-w-0 flex items-center gap-[8px] border border-fog bg-bone rounded-[9px]" style={{ padding: '6px 10px' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icon}</svg>
      <b className="text-[13px] font-bold tabular-nums text-ink">{value}</b>
      <span className="text-[11px] text-stone ml-auto whitespace-nowrap">{sub}</span>
    </div>
  );
}

export default function SessionHero({
  label, session, thresholdPace, zones, hrZones, completed, showAdjust = true, light = false, defaultOpen,
  fuelProducts = [], kcalValue = null, kcalDelta = null,
}: {
  label: string;
  session: PlanSession;
  thresholdPace: string;
  zones: ZoneMap;
  hrZones: HrZoneMap;
  completed: CompletedToday | null;
  accentKey?: 'oxblood' | 'marine' | 'fern';
  showAdjust?: boolean;
  light?: boolean;   // light surface (Recently-completed); only Today's hero is dark
  defaultOpen?: boolean;  // override the open state (post-race lead: show splits up front)
  fuelProducts?: FuelProduct[];   // for the inline long-run fuel log
  kcalValue?: number | null;   // numeric kcal (actual once done, else estimate)
  kcalDelta?: number | null;   // signed actual−plan kcal, once done
}) {
  const intensity = (session.intensity as string | null) ?? 'easy';
  // A merged run (two separate activities stitched into one session) has no valid
  // per-segment splits — collapse its detail to one whole-run line so it reads as done
  // (overall actual vs the planned envelope) rather than per-segment planned rows.
  const merged = !!completed && isMergedRun(completed.segmentActuals);
  const wholeSecs = completed?.mins != null ? completed.mins * 60 : null;
  const { segActuals, segHr } = wholeRunActuals(
    !!session.structure?.length,
    completed
      ? { totalSeconds: wholeSecs, distanceKm: completed.distanceKm, avgHr: completed.avgHr }
      : null,
    completed?.segmentActuals ?? null,
    completed?.segmentHr ?? null,
  );
  const baseSteps = normalizeStructure(
    session.structure?.length ? session.structure : syntheticStructure(session, intensity),
    zones, segActuals, hrZones, segHr,
  );
  const wholeAvgPace = wholeSecs != null && completed?.distanceKm ? Math.round(wholeSecs / completed.distanceKm) : null;
  const steps = merged ? [collapseToWholeRun(baseSteps, wholeAvgPace, completed?.avgHr ?? null)] : baseSteps;
  const plannedSec = sumSegmentSeconds(steps);
  const plannedDur = plannedSec > 0 ? fmtHMMSS(plannedSec) : session.estimated_duration ?? null;
  const profileSession = { ...session, structure: session.structure?.length ? session.structure : syntheticStructure(session, intensity) };
  const isDone = !!completed;

  const displayDuration = completed?.durationStr ? completed.durationStr : plannedDur;
  const displayTss      = completed?.tss != null ? completed.tss : session.estimated_tss ?? null;
  const distPlanned = session.distance_km != null ? Number(session.distance_km) : null;
  const distActual  = completed?.distanceKm ?? null;
  const tssActual   = completed?.tss ?? null;
  const isRace      = session.session_type === 'RACE';
  // Execution score — pacing vs plan. Runs only (not races), when scorable. Skipped
  // for a merged run: a whole-run average can't be graded against the planned segments.
  const exec = isDone && !isRace && !merged ? computeExecutionScore(steps) : null;

  // Long-run quality block — qualifying long runs (planned long run 'LR' OR ≥25 km)
  // with durability metrics computed at sync.
  const isLongRun = !isRace && (session.session_type === 'LR' || (distActual != null && distActual >= 25));
  const showQuality = isDone && isLongRun && completed != null &&
    (completed.efficiencyFactor != null || completed.decouplingPct != null || completed.paceDecayPct != null);

  const compare = isDone ? buildRunCompare(steps, {
    planKm: distPlanned, actKm: distActual, actMins: completed?.mins ?? null,
    estimatedDuration: session.estimated_duration ?? null, avgHr: completed?.avgHr ?? null,
    planTss: session.estimated_tss ?? null, actTss: tssActual, isRace,
  }) : null;

  // Headline metric: distance leads for a run; duration as a fallback.
  const kmStr = (km: number) => `${km % 1 === 0 ? km : km.toFixed(1)} km`;
  const big = isDone
    ? (distActual != null ? kmStr(distActual) : completed?.durationStr ?? '—')
    : (distPlanned != null ? kmStr(distPlanned) : displayDuration ?? '—');

  // Distance delta beneath the headline (km on both breakpoints); a ✓ when on plan.
  const distDelta = compare?.rows.find(r => r.metric === 'Distance') ?? null;

  // Headline stats — time / TSS / kcal, each with its plan-vs-actual delta once done.
  const durStr = displayDuration ? (humanHMM(displayDuration) ?? '—') : '—';
  const kcalStat = kcalValue != null
    ? { v: `${isDone ? '' : '≈ '}${kcalValue.toLocaleString('en-GB')}`, l: 'kcal', delta: isDone && kcalDelta != null ? signedKcal(kcalDelta) : null, tone: 'flat' }
    : null;
  const stats: { v: string; l: string; delta?: string | null; tone?: string }[] = isDone
    ? [
        { v: durStr, l: 'time', delta: compare?.overview.dur?.delta ?? null, tone: compare?.overview.dur?.tone },
        { v: tssActual != null ? `${tssActual}` : '—', l: 'TSS', delta: compare?.overview.tss?.delta ?? null, tone: compare?.overview.tss?.tone },
        ...(kcalStat ? [kcalStat] : []),
      ]
    : [
        { v: durStr, l: 'time' },
        { v: displayTss != null ? `${displayTss}` : '—', l: 'TSS' },
        ...(kcalStat ? [kcalStat] : []),
      ];

  // Fuel & fluid pills — the logged intake once done, else the carbs target (fluid has
  // no per-session model, so it only appears with a logged value).
  const carbTarget = carbTargetLabel(session);
  const fuelPills: { kind: 'fuel' | 'fluid'; value: string; sub: string }[] = isDone
    ? [
        ...(completed?.fuelCarbsPerH != null ? [{ kind: 'fuel' as const, value: `${completed.fuelCarbsPerH} g`, sub: 'carbs / h' }] : []),
        ...(completed?.fluidMl != null ? [{ kind: 'fluid' as const, value: `${completed.fluidMl.toLocaleString('en-GB')} ml`, sub: 'fluid' }] : []),
      ]
    : (carbTarget ? [{ kind: 'fuel' as const, value: carbTarget, sub: 'carbs / h' }] : []);

  // Today's hero is the dark focal tile; Recently-completed renders on a light card.
  const accent = light ? RUN : RUN_B;

  const breakdownIcon = <svg className="shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ color: RUN }}><path d="M3 6h18M3 12h18M3 18h18" /></svg>;
  const adjustIcon = <svg className="shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ color: RUN }}><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></svg>;

  return (
    <details open={defaultOpen ?? !isDone} className={`group rounded-[18px] overflow-hidden mb-[18px] ${light ? 'border border-fog bg-paper text-ink' : 'bg-hero text-onhero'}`}>
      <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer" style={{ padding: '22px 24px' }}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase font-bold inline-flex items-center gap-[7px]" style={{ letterSpacing: '.06em', color: accent }}>
            <RunGlyph size={15} className="" /> Run · {cap(intensity)}
          </span>
          <div className="flex items-center gap-2">
            {isDone && <span className="text-[12px] font-bold" style={{ color: READY }}>✓ Completed</span>}
            <svg className="group-open:rotate-180 transition-transform" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </div>
        </div>
        <div className="flex items-end justify-between gap-4" style={{ marginTop: '6px' }}>
          <div className="min-w-0">
            {/* Scales down on narrow screens so a wide value ("10.0 km", "42.2 km")
                can't overlap the stats; caps at 54px on wider viewports. */}
            <div className="font-display font-bold whitespace-nowrap" style={{ fontSize: 'clamp(34px, 9vw, 54px)', lineHeight: .96 }}>{big}</div>
            {session.description && (
              <div className="text-[12.5px] mt-[7px]" style={{ color: light ? 'var(--color-stone)' : 'rgba(240,238,230,.62)' }}>{session.description}</div>
            )}
            {isDone && distDelta && (
              <div className="text-[11.5px] font-bold mt-[6px] tabular-nums" style={{ color: heroDeltaColor(distDelta.tone, light) }}>
                {distDelta.delta === '✓' ? 'on plan' : <>{distDelta.delta} km<span className="font-medium" style={{ color: light ? 'var(--color-stone)' : 'rgba(240,238,230,.5)' }}> vs plan</span></>}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-start" style={{ gap: '20px', textAlign: 'right' }}>
            {exec && (
              <div className="flex flex-col items-center" title={exec.note}>
                <div className="rounded-full grid place-items-center" style={{ width: '52px', height: '52px', background: `conic-gradient(${scoreColor(exec.score)} ${exec.score}%, ${light ? 'var(--color-fog)' : 'rgba(255,255,255,.16)'} 0)` }}>
                  <div className="rounded-full grid place-items-center font-display font-bold" style={{ width: '40px', height: '40px', background: light ? 'var(--color-paper)' : 'var(--color-hero)', fontSize: '16px' }}>{exec.score}</div>
                </div>
                <div className="text-[10px] uppercase font-bold mt-[3px]" style={{ letterSpacing: '.04em', color: accent }}>exec</div>
              </div>
            )}
            {stats.map((s, i) => (
              <div key={i}>
                <div className="font-display font-bold" style={{ fontSize: '28px' }}>{s.v}</div>
                <div className="text-[11px] uppercase font-bold" style={{ letterSpacing: '.06em', color: accent }}>{s.l}</div>
                {s.delta && <div className="text-[10.5px] font-bold mt-[2px] tabular-nums" style={{ color: heroDeltaColor(s.tone, light) }}>{s.delta}</div>}
              </div>
            ))}
          </div>
        </div>
      </summary>

      {/* Detail — light panel so the profile graph / breakdown / comparison read cleanly. */}
      <div className={`bg-paper text-ink ${light ? 'border-t border-fog' : ''}`} style={{ padding: '16px 24px 20px' }}>
        {showQuality && completed && (
          <div className="mb-[12px]">
            <LongRunQuality
              efficiencyFactor={completed.efficiencyFactor}
              decouplingPct={completed.decouplingPct}
              paceDecayPct={completed.paceDecayPct}
              fuelCarbsPerH={completed.fuelCarbsPerH}
              recommendedGph={session.fuel_target?.kind === 'progression' ? session.fuel_target.gph : null}
              log={completed.workoutId ? {
                workoutId: completed.workoutId,
                movingSecs: completed.mins != null ? Math.round(completed.mins * 60) : null,
                fuelItems: completed.fuelItems,
                products: fuelProducts,
                weightBeforeKg: completed.weightBeforeKg,
                weightAfterKg: completed.weightAfterKg,
                fluidMl: completed.fluidMl,
                runTempC: completed.runTempC,
              } : null}
            />
          </div>
        )}
        {/* Any completed run that isn't a long run still gets a fuel + fluid entry
            (weigh-ins feed the sweat model from runs across all conditions). */}
        {isDone && !showQuality && completed?.workoutId && fuelProducts && (
          <div className="mb-[12px]">
            <LogNutritionRow
              runId={completed.workoutId}
              movingSecs={completed.mins != null ? Math.round(completed.mins * 60) : null}
              fuelCarbsPerH={completed.fuelCarbsPerH}
              fuelItems={completed.fuelItems}
              products={fuelProducts}
              weightBeforeKg={completed.weightBeforeKg}
              weightAfterKg={completed.weightAfterKg}
              fluidMl={completed.fluidMl}
              runTempC={completed.runTempC}
            />
          </div>
        )}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-[12px] sm:gap-6">
          {session.rationale && (
            <p className="text-[13px] leading-snug border-l-[3px] pl-[14px] text-ink order-2 sm:order-1" style={{ borderColor: RUN }}>
              <span className="font-bold" style={{ color: RUN }}>Why · </span>{session.rationale}
            </p>
          )}
          <div className="order-1 sm:order-2 shrink-0">
            <ProfileChart
              bars={buildProfileBars(profileSession, thresholdPace, zones, segActuals)}
              size="lg"
              color={INTENSITY[intensity]?.hex ?? '#17191e'}
              opacity={segActuals ? 0.9 : 0.6}
            />
          </div>
        </div>

        {/* Fuel & fluid — logged intake once done, else the carbs target. */}
        {fuelPills.length > 0 && (
          <div className="mt-[14px]">
            <div className="text-[10px] font-bold tracking-[.07em] uppercase text-stone mb-[6px]">Fuel &amp; fluid · {isDone ? 'logged' : 'target'}</div>
            <div className="flex gap-[6px]">
              {fuelPills.map((p, i) => <FuelPill key={i} {...p} />)}
            </div>
          </div>
        )}

        <div className="mt-[14px]">
          {steps.length > 0 && (
            <HeroAccordion
              title="Session breakdown"
              meta={isDone ? 'plan vs actual' : null}
              icon={breakdownIcon}
              defaultOpen={isDone || !!session.structure?.length}
            >
              {isDone && compare && compare.rows.length > 0 && (
                <div className="mb-[10px]"><CompareTable rows={compare.rows} bare /></div>
              )}
              <WorkoutDetail steps={steps} variant="card" isRace={isRace} />
            </HeroAccordion>
          )}
          {!isDone && showAdjust && label === 'Today' && (
            <HeroAccordion title="Adjust today's run" icon={adjustIcon}>
              <div className="flex flex-wrap gap-2 pt-[2px]">
                {['Short on time', 'Legs feel flat', "Can't today"].map(chip => (
                  <span key={chip} className="border border-fog bg-bone rounded-full px-[14px] py-[7px] text-[14px] text-ink">{chip}</span>
                ))}
              </div>
            </HeroAccordion>
          )}
        </div>
      </div>
    </details>
  );
}
