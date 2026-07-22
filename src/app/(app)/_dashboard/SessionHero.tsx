// Run hero for the dashboard Today agenda + Recently-completed card. Server
// component. Renders through the shared HeroShell (tinted band + sport rail):
// the summary shows the headline distance and the time/TSS/kcal stats (each
// carrying a plan-vs-actual delta once done); the body keeps the "why", the
// intensity-profile graph and the fuel/fluid pills; the tinted footer collapses
// the plan-vs-actual breakdown and the "Adjust today" options into accordions.

import ProfileChart from '@/components/ProfileChart';
import { buildProfileBars } from '@/lib/profile';
import { normalizeStructure } from '@/lib/plan-structure';
import { computeExecutionScore, scoreColor } from '@/lib/execution-score';
import type { ZoneMap, HrZoneMap } from '@/lib/plan-structure';
import {
  INTENSITY, WorkoutDetail, CompareTable, HeroAccordion, heroDeltaColor, signedKcal, syntheticStructure, sumSegmentSeconds,
  fmtHMMSS, humanHMM, wholeRunActuals, buildRunCompare, isMergedRun, collapseToWholeRun,
} from '@/components/session-ui';
import { HeroShell, HeroStatRow, HeroDone, HeroWhen, type HeroStat } from '@/components/HeroShell';
import { RunGlyph } from '@/components/glyphs';
import LongRunQuality from '@/components/LongRunQuality';
import LogNutritionRow from '@/components/LogNutritionRow';
import { LOW_FUEL_MAX_GPH } from '@/lib/fuel-progression';
import type { FuelProduct } from '@/data/fuel';
import { RUN } from '@/lib/colors';
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
  label, session, thresholdPace, zones, hrZones, completed, showAdjust = true,  defaultOpen,
  fuelProducts = [], kcalValue = null, kcalDelta = null, collapseSplits = false,
}: {
  label: string;
  session: PlanSession;
  thresholdPace: string;
  zones: ZoneMap;
  hrZones: HrZoneMap;
  completed: CompletedToday | null;
  accentKey?: 'oxblood' | 'marine' | 'fern';
  showAdjust?: boolean;
  light?: boolean;   // legacy (dark focal tile vs light) — every hero now renders the light shell
  defaultOpen?: boolean;  // override the open state (post-race lead: show splits up front)
  fuelProducts?: FuelProduct[];   // for the inline long-run fuel log
  kcalValue?: number | null;   // numeric kcal (actual once done, else estimate)
  kcalDelta?: number | null;   // signed actual−plan kcal, once done
  collapseSplits?: boolean;   // tuck the per-km splits behind a nested accordion (dashboard "Recently completed"); keep the summary table visible
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
  const stats: HeroStat[] = isDone
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

  const breakdownIcon = <svg className="shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ color: RUN }}><path d="M3 6h18M3 12h18M3 18h18" /></svg>;
  const adjustIcon = <svg className="shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ color: RUN }}><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></svg>;

  const summary = (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-[12px] sm:gap-6">
      <div className="min-w-0">
        <div className="font-display font-bold whitespace-nowrap tabular-nums" style={{ fontSize: 'clamp(32px, 8vw, 44px)', lineHeight: .96 }}>{big}</div>
        {isDone && distDelta && (
          <div className="text-[11.5px] font-bold mt-[5px] tabular-nums" style={{ color: heroDeltaColor(distDelta.tone, true) }}>
            {distDelta.delta === '✓' ? 'on plan' : <>{distDelta.delta} km<span className="font-medium text-stone"> vs plan</span></>}
          </div>
        )}
        {session.description && <div className="text-[12.5px] leading-snug text-stone mt-[5px]">{session.description}</div>}
      </div>
      <div className="flex items-end gap-[18px] shrink-0">
        {exec && (
          <div className="flex flex-col items-center" title={exec.note}>
            <div className="rounded-full grid place-items-center" style={{ width: '46px', height: '46px', background: `conic-gradient(${scoreColor(exec.score)} ${exec.score}%, var(--color-fog) 0)` }}>
              <div className="rounded-full grid place-items-center font-display font-bold bg-paper" style={{ width: '36px', height: '36px', fontSize: '15px' }}>{exec.score}</div>
            </div>
            <div className="text-[10px] uppercase font-bold mt-[3px] text-stone" style={{ letterSpacing: '.04em' }}>exec</div>
          </div>
        )}
        <HeroStatRow stats={stats} />
      </div>
    </div>
  );

  const foot = (
    <>
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
          {collapseSplits ? (
            <HeroAccordion title="Splits" meta="per km" defaultOpen={false}>
              <WorkoutDetail steps={steps} variant="card" isRace={isRace} />
            </HeroAccordion>
          ) : (
            <WorkoutDetail steps={steps} variant="card" isRace={isRace} />
          )}
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
    </>
  );

  return (
    <HeroShell
      sport="run"
      eyebrow={<><RunGlyph size={15} className="" /> Run · {cap(intensity)}</>}
      status={isDone ? <HeroDone /> : <HeroWhen>{label}</HeroWhen>}
      defaultOpen={defaultOpen ?? !isDone}
      summary={summary}
      foot={foot}
    >
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
    </HeroShell>
  );
}
