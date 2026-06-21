'use client';

import { useState } from 'react';
import { humanHMM } from './session-ui';
import { Dumbbell } from './glyphs';

export interface StrengthEx {
  name: string;
  sets: number;
  reps: number;
  reps_type?: string;
  weight?: number | null;
  target?: string | null;
}

// Column grid for the exercise table — mirrors the run segment table (WorkoutDetail).
export const STRENGTH_COLS = '1fr 46px 66px 78px';

export const repsStr = (ex: StrengthEx) => (ex.reps_type === 'secs' ? `${ex.reps}s` : `${ex.reps}`);
export const loadStr = (ex: StrengthEx) => (ex.weight != null && Number(ex.weight) > 0 ? `${ex.weight} kg` : '—');

// Neutral tinted pill, matching the run's zone-chip styling.
export function MuscleChip({ label }: { label: string }) {
  return (
    <span
      className="font-mono text-[11px] px-[5px] py-[1px] rounded-[4px] whitespace-nowrap shrink-0"
      style={{ background: '#8a857a22', color: '#8a857a' }}
    >
      {label}
    </span>
  );
}

// The exercise table body (header + one row per exercise) shared by the strength
// row, the dashboard StrengthHero, and the dashboard compact row. Each caller
// supplies its own wrapper (padding/border differs); this owns the grid only.
export function StrengthDetailTable({ exercises }: { exercises: StrengthEx[] }) {
  return (
    <>
      <div
        className="grid items-center gap-x-[10px] pb-[6px] mb-[2px] border-b border-fog/50"
        style={{ gridTemplateColumns: STRENGTH_COLS }}
      >
        {['Exercise', 'Sets', 'Reps', 'Load'].map((h, i) => (
          <span key={h} className={`font-mono text-[11.5px] tracking-[.1em] uppercase text-stone ${i === 0 ? '' : 'text-right'}`}>
            {h}
          </span>
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
    </>
  );
}

// A strength session row — compact (duration + focus), expandable to the
// prescribed exercises + an optional note.
export default function StrengthRow({
  short, date, focus, duration, today, done, note, exercises = [],
}: {
  short: string; date: string; focus: string | null; duration: string | null;
  today?: boolean; done?: boolean; note?: string | null; exercises?: StrengthEx[];
}) {
  const [open, setOpen] = useState(false);
  const hasDetail = exercises.length > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-[14px] border-l-[3px] border-l-stone/40 px-[16px] py-[12px] ${hasDetail ? 'cursor-pointer select-none hover:bg-fog/15 transition-colors' : ''}`}
        onClick={hasDetail ? () => setOpen(o => !o) : undefined}
        role={hasDetail ? 'button' : undefined}
        tabIndex={hasDetail ? 0 : undefined}
        aria-expanded={hasDetail ? open : undefined}
        onKeyDown={hasDetail ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); } } : undefined}
      >
        <div className="w-[46px] shrink-0">
          <div className="font-display font-semibold text-[16px] leading-none text-ink">{short}</div>
          <div className="font-mono text-[12.5px] text-stone mt-[4px]">{date}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-[7px] leading-tight">
            {today && (
              <span className="font-mono text-[11px] tracking-[.12em] uppercase text-oxblood border border-oxblood/40 rounded-[4px] px-[5px] py-[1px] shrink-0">
                Today
              </span>
            )}
            {done && <span className="text-fern text-[15px] leading-none shrink-0">✓</span>}
            <Dumbbell size={15} className="text-stone shrink-0" />
            <span className="text-[16.5px] font-semibold text-ink">Strength</span>
            {hasDetail && (
              <span className="font-mono text-[14px] text-stone leading-none"
                style={{ display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>
                ▾
              </span>
            )}
          </div>
          {focus && <div className="text-[14.5px] leading-tight mt-[3px] truncate text-stone">{focus}</div>}
        </div>
        <div className="shrink-0 text-right w-[78px]">
          <div className="font-display font-semibold text-[19px] leading-none text-ink">{humanHMM(duration) ?? '—'}</div>
        </div>
      </div>

      {open && hasDetail && (
        <div className="border-t border-fog/60 bg-bone/40 pl-[60px] pr-[18px] py-[12px]">
          <StrengthDetailTable exercises={exercises} />

          {note && <div className="text-[13.5px] text-stone leading-snug mt-[8px]">{note}</div>}
        </div>
      )}
    </div>
  );
}
