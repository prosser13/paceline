'use client';

// Shared run/race session row — used by BOTH the plan page (PlanThread) and the
// dashboard "Tomorrow" block (SessionRows). One source of truth for how a
// run/race row looks and expands.
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
  INTENSITY, MetricBlock, WorkoutDetail, CompareTable, PlannedDetail, RaceBadge,
  syntheticStructure, sumSegmentSeconds, fmtHMMSS, wholeRunActuals, buildRunCompare, parseDurationMins,
  type CompareRow, type WindowCmp,
} from './session-ui';
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
}

export interface RunRowCompleted {
  durationStr: string;
  durationMins?: number | null;
  distanceKm?: number | null;
  tss: number | null;
  avgHr?: number | null;
  avgPower?: number | null;
  segmentActuals?: (number | null)[] | null;
  segmentHr?: (number | null)[] | null;
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
  today = false, next = false, done = false,
  emphasis = false,
  isExpanded, onToggle,
}: {
  session: RunRowSession;
  zones: ZoneMap;
  hrZones: HrZoneMap;
  thresholdPace: string;
  completed?: RunRowCompleted | null;
  today?: boolean;
  next?: boolean;
  done?: boolean;
  emphasis?: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
}) {
  const [openLocal, setOpenLocal] = useState(false);
  const open = isExpanded ?? openLocal;
  const toggle = onToggle ?? (() => setOpenLocal(o => !o));

  const isRace    = session.session_type === 'RACE';
  const intensity = session.intensity ?? 'easy';

  const { segActuals, segHr } = done && completed
    ? wholeRunActuals(
        !!session.structure?.length,
        {
          totalSeconds: (() => {
            const mins = completed.durationMins ?? parseDurationMins(completed.durationStr);
            return mins != null ? mins * 60 : null;
          })(),
          distanceKm: completed.distanceKm ?? null,
          avgHr: completed.avgHr ?? null,
        },
        completed.segmentActuals ?? null,
        completed.segmentHr ?? null,
      )
    : { segActuals: null, segHr: null };

  const detailSteps = normalizeStructure(
    session.structure?.length ? session.structure : syntheticStructure(session, intensity),
    zones, segActuals, hrZones, segHr,
  );

  const plannedSec         = sumSegmentSeconds(detailSteps);
  const plannedDurationStr = plannedSec > 0 ? fmtHMMSS(plannedSec) : session.estimated_duration ?? null;
  const displayTss      = done && completed?.tss != null ? completed.tss : session.estimated_tss ?? null;
  const displayDuration = done && completed?.durationStr ? completed.durationStr : plannedDurationStr;
  const rowKm   = done ? completed?.distanceKm ?? null : (session.distance_km != null ? Number(session.distance_km) : null);
  const kmLabel = rowKm != null ? `${rowKm % 1 === 0 ? rowKm : rowKm.toFixed(1)} km` : null;

  // Execution score — how well the actual pacing hit the planned targets. Runs only,
  // and only when there are scorable pace segments (never a meaningless 100).
  const exec = done && completed && !isRace ? computeExecutionScore(detailSteps) : null;

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
              {done && <span className="text-fern text-[15px] leading-none shrink-0 mt-[2px]">✓</span>}
              <RunGlyph size={emphasis ? 18 : 15} className="text-stone shrink-0 mt-[3px]" />
              <span className={`${emphasis ? 'text-[18px]' : 'text-[16.5px]'} font-semibold text-ink flex-1 min-w-0`}>
                {session.name}
                {session.priority && <> <RaceBadge priority={session.priority} /></>}
                <span className="font-mono text-[13px] text-stone leading-none inline-block align-middle ml-[5px]"
                  style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>▾</span>
              </span>
            </div>

            <div className="mt-[7px]">
              {(kmLabel || session.description) && (
                <div className="text-[14px] leading-snug text-stone">
                  {kmLabel && <span className="font-semibold text-ink">{kmLabel}</span>}
                  {kmLabel && session.description && ' · '}
                  {session.description}
                </div>
              )}
              {exec && (
                <div className="mt-[6px]">
                  <span
                    className="inline-flex items-center gap-[5px] font-mono text-[11px] font-bold rounded-[5px] border px-[6px] py-[1px]"
                    style={{ color: scoreColor(exec.score), borderColor: `color-mix(in srgb, ${scoreColor(exec.score)} 45%, transparent)` }}
                    title={exec.note}
                  >
                    {exec.score}<span className="text-stone font-medium">execution</span>
                  </span>
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
          <WorkoutDetail steps={detailSteps} isRace={isRace} />
        </>
      ) : (
        <PlannedDetail steps={detailSteps} />
      ))}
    </div>
  );
}
