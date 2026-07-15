'use client';

// Run/race session row for the plan page (via SessionRow ← PlanThread). One source
// of truth for how a run/race row looks and expands.
//
// - Planned (future): graph slot + expandable per-segment PlannedDetail.
// - Completed (past): plan-vs-actual DeltaBlock slot + expandable CompareTable +
//   per-segment WorkoutDetail. Pass `completed` to enable this path; omit it
//   (dashboard) for planned-only.
// - Expansion is CONTROLLED when `onToggle` is supplied (the plan page keeps the
//   open set in parent state so it survives match/merge re-renders); otherwise
//   the row self-manages a local open state (dashboard).

import { useState } from 'react';
import Link from 'next/link';
import ProfileChart from './ProfileChart';
import { buildProfileBars } from '@/lib/profile';
import { normalizeStructure } from '@/lib/plan-structure';
import type { ZoneMap, HrZoneMap } from '@/lib/plan-structure';
import { computeExecutionScore, scoreColor } from '@/lib/execution-score';
import {
  INTENSITY, MetricBlock, WorkoutDetail, CompareTable, PlannedDetail, RaceBadge, DETAIL_WRAP,
  syntheticStructure, sumSegmentSeconds, fmtHMMSS, wholeRunActuals, buildRunCompare, parseDurationMins,
  isMergedRun, collapseToWholeRun, StatusTick, missedText, type CompareRow, type WindowCmp,
} from './session-ui';
import LongRunQuality from './LongRunQuality';
import { fuelTargetLabel, type FuelTarget } from '@/lib/fuel-progression';
import type { FuelProduct } from '@/data/fuel';
import { RunGlyph } from './glyphs';

export interface RunRowSession {
  id?: string;
  session_type?: string | null;
  activity_type?: string | null;
  name: string;
  description?: string | null;
  distance_km?: number | null;
  intensity?: string | null;
  estimated_tss?: number | null;
  estimated_duration?: string | null;
  priority?: string | null;
  race_slug?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  structure?: any[] | null;
  fuel_target?: FuelTarget | null;
}

export interface RunRowCompleted {
  workoutId?: string | null;
  durationStr: string;
  durationMins?: number | null;
  distanceKm?: number | null;
  tss: number | null;
  avgHr?: number | null;
  avgPower?: number | null;
  segmentActuals?: (number | null)[] | null;
  segmentHr?: (number | null)[] | null;
  perceivedEffort?: number | null;
  decouplingPct?: number | null;
  paceDecayPct?: number | null;
  fuelCarbsPerH?: number | null;
  fuelItems?: { name: string; carbs_g: number; qty: number }[] | null;
  weightBeforeKg?: number | null;
  weightAfterKg?: number | null;
  fluidMl?: number | null;
  runTempC?: number | null;
  efficiencyFactor?: number | null;
}

const toneClass = (t?: string) =>
  (t === 'pos' ? 'text-fern' : t === 'fast' ? 'text-marine' : t === 'neg' ? 'text-ember' : 'text-stone');

// Compact left-aligned "vs plan" line — the TSS and Duration windows from the
// detail table, so the glance and the table always agree (✓ in band, gap out).
function DeltaBlock({ tss, dur }: { tss: WindowCmp | null; dur: WindowCmp | null }) {
  if (!tss && !dur) return null;
  return (
    <div className="font-mono text-[12.5px] flex items-center gap-[6px] whitespace-nowrap leading-none">
      <span className="text-[10px] uppercase tracking-[.08em] text-stone">vs plan</span>
      {tss && <span className={toneClass(tss.tone)}>{tss.delta}</span>}
      {tss && dur && <span className="text-fog">·</span>}
      {dur && <span className={toneClass(dur.tone)}>{dur.delta}</span>}
    </div>
  );
}

export default function RunRow({
  session, zones, hrZones, thresholdPace,
  completed = null,
  today = false, next = false, done = false, missed = false,
  emphasis = false,
  isExpanded, onToggle,
  fuelProducts = [],
}: {
  session: RunRowSession;
  zones: ZoneMap;
  hrZones: HrZoneMap;
  thresholdPace: string;
  completed?: RunRowCompleted | null;
  today?: boolean;
  next?: boolean;
  done?: boolean;
  missed?: boolean;
  emphasis?: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
  fuelProducts?: FuelProduct[];
}) {
  const [openLocal, setOpenLocal] = useState(false);
  const open = isExpanded ?? openLocal;
  const toggle = onToggle ?? (() => setOpenLocal(o => !o));

  const isRace    = session.session_type === 'RACE';
  const intensity = session.intensity ?? 'easy';

  // A merged run (two separate activities stitched into one session) has no valid
  // per-segment splits — collapse its detail to one whole-run line so it reads as done
  // (overall actual vs the planned envelope) rather than per-segment planned rows.
  const merged = done && !!completed && isMergedRun(completed.segmentActuals);
  const wholeSecs = done && completed
    ? (() => { const m = completed.durationMins ?? parseDurationMins(completed.durationStr); return m != null ? m * 60 : null; })()
    : null;

  const { segActuals, segHr } = done && completed
    ? wholeRunActuals(
        !!session.structure?.length,
        { totalSeconds: wholeSecs, distanceKm: completed.distanceKm ?? null, avgHr: completed.avgHr ?? null },
        completed.segmentActuals ?? null,
        completed.segmentHr ?? null,
      )
    : { segActuals: null, segHr: null };

  const baseSteps = normalizeStructure(
    session.structure?.length ? session.structure : syntheticStructure(session, intensity),
    zones, segActuals, hrZones, segHr,
  );
  const wholeAvgPace = wholeSecs != null && completed?.distanceKm ? Math.round(wholeSecs / completed.distanceKm) : null;
  const detailSteps = merged
    ? [collapseToWholeRun(baseSteps, wholeAvgPace, completed?.avgHr ?? null)]
    : baseSteps;

  const plannedSec         = sumSegmentSeconds(detailSteps);
  const plannedDurationStr = plannedSec > 0 ? fmtHMMSS(plannedSec) : session.estimated_duration ?? null;
  const displayTss      = done && completed?.tss != null ? completed.tss : session.estimated_tss ?? null;
  const displayDuration = done && completed?.durationStr ? completed.durationStr : plannedDurationStr;
  const rowKm   = done ? completed?.distanceKm ?? null : (session.distance_km != null ? Number(session.distance_km) : null);
  const kmLabel = rowKm != null ? `${rowKm % 1 === 0 ? rowKm : rowKm.toFixed(1)} km` : null;

  // Execution score — how well the actual pacing hit the planned targets. Runs only,
  // and only when there are scorable pace segments (never a meaningless 100). Skipped
  // for a merged run: a whole-run average can't be graded against the planned segments.
  const exec = done && completed && !isRace && !merged ? computeExecutionScore(detailSteps) : null;

  // Long-run quality block — shown on qualifying long runs (planned long run 'LR'
  // OR ≥25 km), when the durability metrics were computed at sync.
  const isLongRun = !isRace && (session.session_type === 'LR' || (rowKm != null && rowKm >= 25));
  const showQuality = done && isLongRun && completed != null &&
    (completed.efficiencyFactor != null || completed.decouplingPct != null || completed.paceDecayPct != null);

  // Completed run → Plan / Actual / Δ comparison via the shared builder (the
  // same maths/wording as the dashboard hero). ovDur/ovTss feed the compact
  // "vs plan" slot so the glance and the expanded table always agree.
  let compareRows: CompareRow[] | null = null;
  let ovDur: WindowCmp | null = null;
  let ovTss: WindowCmp | null = null;
  if (done && completed) {
    const cmp = buildRunCompare(detailSteps, {
      planKm: session.distance_km != null ? Number(session.distance_km) : null,
      actKm: completed.distanceKm ?? null,
      actMins: completed.durationMins ?? parseDurationMins(completed.durationStr),
      estimatedDuration: session.estimated_duration ?? null,
      avgHr: completed.avgHr ?? null,
      planTss: session.estimated_tss ?? null,
      actTss: completed.tss ?? null,
      isRace,
    });
    compareRows = cmp.rows;
    ovTss = cmp.overview.tss;
    ovDur = cmp.overview.dur;
  }

  // The graph (upcoming) / vs-plan (completed) slot, rendered at two sizes: a
  // small one beneath the description on mobile, a larger one in its own centred
  // column on desktop.
  const profileBars = buildProfileBars(
    { ...session, structure: session.structure?.length ? session.structure : syntheticStructure(session, intensity) },
    thresholdPace, zones, segActuals,
  );
  const renderSlot = (size: 'xs' | 'sm') => (done && (ovTss || ovDur)) ? (
    <DeltaBlock tss={ovTss} dur={ovDur} />
  ) : (
    <ProfileChart bars={profileBars} size={size}
      color={INTENSITY[intensity]?.hex ?? '#17191e'} opacity={segActuals ? 0.9 : 0.6} />
  );

  return (
    <div>
      <div
        className={`border-l-[3px] ${emphasis ? 'px-[18px] py-[15px]' : 'px-[16px] py-[12px]'} transition-colors cursor-pointer select-none ${today ? 'bg-oxblood-soft/35' : ''} hover:bg-fog/15`}
        style={{ borderLeftColor: INTENSITY[intensity]?.hex ?? '#17191e' }}
        onClick={toggle}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
      >
        <div className="flex items-start justify-between gap-[14px]">
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-[7px] leading-tight">
              {next && (
                <span className="font-mono text-[11px] tracking-[.12em] uppercase text-oxblood border border-oxblood/40 rounded-[4px] px-[5px] py-[1px] shrink-0 mt-[1px]">
                  Next up
                </span>
              )}
              {isRace && (
                <span className="font-mono text-[11px] tracking-[.1em] uppercase bg-oxblood text-bone rounded-[4px] px-[5px] py-[2px] shrink-0 mt-[1px]">Race</span>
              )}
              <StatusTick done={done} missed={missed} className="mt-[2px]" />
              <RunGlyph size={emphasis ? 18 : 15} className="text-stone shrink-0 mt-[3px]" />
              <span className={`${emphasis ? 'text-[18px]' : 'text-[16.5px]'} font-semibold text-ink flex-1 min-w-0${missedText(missed)}`}>
                {session.name}
                {session.priority && <> <RaceBadge priority={session.priority} /></>}
                <span className="font-mono text-[13px] text-stone leading-none inline-block align-middle ml-[5px]"
                  style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>▾</span>
              </span>
            </div>

            <div className="mt-[7px]">
              {(kmLabel || session.description) && (
                <div className={`text-[14px] leading-snug text-stone${missedText(missed)}`}>
                  {kmLabel && <span className="font-semibold text-ink">{kmLabel}</span>}
                  {kmLabel && session.description && ' · '}
                  {session.description}
                </div>
              )}
              {/* Gut-training fuel guidance on planned goal-block sessions. */}
              {!done && session.fuel_target && (
                <div className="mt-[6px]">
                  <span
                    className={`inline-flex items-center font-mono text-[11px] rounded-[5px] border px-[6px] py-[1px] ${
                      session.fuel_target.kind === 'progression'
                        ? 'font-bold text-strength border-strength/45'
                        : 'text-stone border-fog'
                    }`}
                  >
                    {fuelTargetLabel(session.fuel_target)}
                  </span>
                </div>
              )}
              {(exec || (done && completed?.perceivedEffort != null)) && (
                <div className="mt-[6px] flex items-center gap-[6px] flex-wrap">
                  {exec && (
                    <span
                      className="inline-flex items-center gap-[5px] font-mono text-[11px] font-bold rounded-[5px] border px-[6px] py-[1px]"
                      style={{ color: scoreColor(exec.score), borderColor: `color-mix(in srgb, ${scoreColor(exec.score)} 45%, transparent)` }}
                      title={exec.note}
                    >
                      {exec.score}<span className="text-stone font-medium">execution</span>
                    </span>
                  )}
                  {done && completed?.perceivedEffort != null && (
                    <span className="inline-flex items-center gap-[4px] font-mono text-[11px] font-bold text-stone border border-fog rounded-[5px] px-[6px] py-[1px]" title="Effort you logged on your watch">
                      RPE {completed.perceivedEffort}<span className="text-stone/60 font-medium">/10</span>
                    </span>
                  )}
                </div>
              )}
              {session.race_slug && (
                <Link href={`/races/${session.race_slug}`} onClick={e => e.stopPropagation()}
                  className="inline-block mt-[5px] font-mono text-[11px] tracking-[.08em] uppercase text-marine hover:text-marine-dark">
                  Race Guide →
                </Link>
              )}
              {/* Mobile: graph / vs-plan beneath the description. */}
              <div className="mt-[8px] sm:hidden">{renderSlot('xs')}</div>
            </div>
          </div>

          {/* Desktop: graph / vs-plan in its own column, vertically centred. */}
          <div className="hidden sm:flex items-center self-stretch shrink-0">{renderSlot('sm')}</div>

          <MetricBlock duration={displayDuration} distanceKm={null} tss={displayTss} estimated={!done} />
        </div>
      </div>

      {open && (compareRows ? (
        // Completed: whole-run summary, then the per-segment breakdown.
        <>
          <CompareTable rows={compareRows} />
          {showQuality && completed && (
            <div className={`${DETAIL_WRAP} py-[8px]`}>
              <LongRunQuality
                efficiencyFactor={completed.efficiencyFactor ?? null}
                decouplingPct={completed.decouplingPct ?? null}
                paceDecayPct={completed.paceDecayPct ?? null}
                fuelCarbsPerH={completed.fuelCarbsPerH ?? null}
                recommendedGph={session.fuel_target?.kind === 'progression' ? session.fuel_target.gph : null}
                log={completed.workoutId ? {
                  workoutId: completed.workoutId,
                  movingSecs: (completed.durationMins ?? null) != null ? Math.round((completed.durationMins as number) * 60) : null,
                  fuelItems: completed.fuelItems ?? null,
                  products: fuelProducts,
                  weightBeforeKg: completed.weightBeforeKg ?? null,
                  weightAfterKg: completed.weightAfterKg ?? null,
                  fluidMl: completed.fluidMl ?? null,
                  runTempC: completed.runTempC ?? null,
                } : null}
              />
            </div>
          )}
          <WorkoutDetail steps={detailSteps} isRace={isRace} />
        </>
      ) : (
        <PlannedDetail steps={detailSteps} />
      ))}
    </div>
  );
}
