'use client';

// Compact, expandable session rows with NO per-row date column — the date is
// owned by the parent (a day group / card). Shared by all three prototypes so a
// multi-session day reads as one block. Handles run, strength and rest.

import { useState } from 'react';
import ProfileChart from '@/components/ProfileChart';
import { buildProfileBars } from '@/lib/profile';
import { normalizeStructure } from '@/lib/plan-structure';
import type { ZoneMap, HrZoneMap } from '@/lib/plan-structure';
import {
  INTENSITY, MetricBlock, WorkoutDetail, syntheticStructure, sumSegmentSeconds, fmtHMM, humanHMM,
} from '@/components/session-ui';
import {
  type StrengthEx, STRENGTH_COLS, MuscleChip, repsStr, loadStr,
} from '@/components/StrengthRow';
import type { PlanSession } from './data';

function RunGlyph() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
         strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      <circle cx="13" cy="4" r="1" />
      <path d="M4 17l5 1l.75 -1.5" />
      <path d="M15 21l0 -4l-4 -3l1 -6" />
      <path d="M7 12l0 -3l5 -1l3 3l3 1" />
    </svg>
  );
}
function Dumbbell() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
         strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      <path d="M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11" />
    </svg>
  );
}

function RunRow({ session, thresholdPace, zones, hrZones }: {
  session: PlanSession; thresholdPace: string; zones: ZoneMap; hrZones: HrZoneMap;
}) {
  const [open, setOpen] = useState(false);
  const intensity = session.intensity ?? 'easy';
  const hex = INTENSITY[intensity]?.hex ?? '#17191e';
  const steps = normalizeStructure(
    session.structure?.length ? session.structure : syntheticStructure(session, intensity),
    zones, null, hrZones,
  );
  const plannedSec = sumSegmentSeconds(steps);
  const duration   = plannedSec > 0 ? fmtHMM(plannedSec) : session.estimated_duration ?? null;

  return (
    <div>
      <div
        className="flex items-center gap-[12px] px-[14px] py-[11px] cursor-pointer select-none hover:bg-fog/15 transition-colors"
        style={{ borderLeft: `3px solid ${hex}` }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ color: hex }}><RunGlyph /></span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-[7px] leading-tight">
            <span className="text-[16px] font-semibold text-ink truncate">{session.name}</span>
            <span className="font-mono text-[13px] text-stone leading-none"
              style={{ display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>▾</span>
          </div>
          {session.description && (
            <div className="text-[13.5px] leading-tight mt-[2px] truncate text-stone">{session.description}</div>
          )}
        </div>
        <ProfileChart bars={buildProfileBars(session, thresholdPace, zones)} size="xs" color={hex} opacity={0.6} />
        <MetricBlock
          duration={duration}
          distanceKm={session.distance_km != null ? Number(session.distance_km) : null}
          tss={session.estimated_tss ?? null}
          estimated
        />
      </div>
      {open && <WorkoutDetail steps={steps} />}
    </div>
  );
}

function StrengthRowCompact({ session }: { session: PlanSession }) {
  const [open, setOpen] = useState(false);
  const exercises = (session.structure as unknown as StrengthEx[] | null) ?? [];
  const hasDetail = exercises.length > 0;
  const GOLD = '#8f6512';

  return (
    <div>
      <div
        className={`flex items-center gap-[12px] px-[14px] py-[11px] ${hasDetail ? 'cursor-pointer select-none hover:bg-fog/15 transition-colors' : ''}`}
        style={{ borderLeft: `3px solid ${GOLD}` }}
        onClick={hasDetail ? () => setOpen(o => !o) : undefined}
      >
        <span style={{ color: GOLD }}><Dumbbell /></span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-[7px] leading-tight">
            <span className="text-[16px] font-semibold text-ink truncate">Strength</span>
            {hasDetail && (
              <span className="font-mono text-[13px] text-stone leading-none"
                style={{ display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>▾</span>
            )}
          </div>
          {session.description && (
            <div className="text-[13.5px] leading-tight mt-[2px] truncate text-stone">{session.description}</div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display font-semibold text-[18px] leading-none text-ink">{humanHMM(session.estimated_duration ?? null) ?? '—'}</div>
          {hasDetail && <div className="font-mono text-[12px] text-stone mt-[3px]">{exercises.length} ex</div>}
        </div>
      </div>

      {open && hasDetail && (
        <div className="border-t border-fog/60 bg-bone/40 pl-[44px] pr-[18px] py-[12px]">
          <div className="grid items-center gap-x-[10px] pb-[6px] mb-[2px] border-b border-fog/50" style={{ gridTemplateColumns: STRENGTH_COLS }}>
            {['Exercise', 'Sets', 'Reps', 'Load'].map((hd, i) => (
              <span key={hd} className={`font-mono text-[11.5px] tracking-[.1em] uppercase text-stone ${i === 0 ? '' : 'text-right'}`}>{hd}</span>
            ))}
          </div>
          {exercises.map((ex, i) => (
            <div key={i} className="py-[6px] grid items-center gap-x-[10px]" style={{ gridTemplateColumns: STRENGTH_COLS }}>
              <span className="text-[14.5px] font-medium text-ink flex items-center gap-[7px] min-w-0">
                <span className="truncate">{ex.name}</span>
                {ex.target && <MuscleChip label={ex.target} />}
              </span>
              <span className="font-mono text-[14px] text-ink text-right tabular-nums">{ex.sets}</span>
              <span className="font-mono text-[14px] text-ink text-right tabular-nums">{repsStr(ex)}</span>
              <span className="font-mono text-[14px] text-ink text-right tabular-nums">{loadStr(ex)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SessionRows({ sessions, thresholdPace, zones, hrZones, restLabel = 'Rest day' }: {
  sessions: PlanSession[]; thresholdPace: string; zones: ZoneMap; hrZones: HrZoneMap; restLabel?: string;
}) {
  if (!sessions.length || sessions.every(s => s.status === 'rest')) {
    return (
      <div className="flex items-center gap-[10px] px-[14px] py-[12px] text-stone"
        style={{ borderLeft: '3px solid transparent', outline: '1px dashed #c9c2b2', outlineOffset: '-1px' }}>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 7v11M3 12h13a4 4 0 0 1 4 4v2M3 18h18M8 7h8a2 2 0 0 1 2 2v3" />
        </svg>
        <span className="text-[15px]">{restLabel}</span>
      </div>
    );
  }
  return (
    <div className="divide-y divide-fog/50">
      {sessions.filter(s => s.status !== 'rest').map(s =>
        s.session_type === 'STRENGTH'
          ? <StrengthRowCompact key={s.id} session={s} />
          : <RunRow key={s.id} session={s} thresholdPace={thresholdPace} zones={zones} hrZones={hrZones} />,
      )}
    </div>
  );
}
