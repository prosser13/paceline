'use client';

import { useState } from 'react';
import { humanHMM } from './session-ui';
import { Dumbbell } from './glyphs';
import { GOLD } from '@/lib/colors';

export interface StrengthEx {
  name: string;
  sets: number;
  reps: number;
  reps_type?: string;
  weight?: number | null;
  target?: string | null;
}

export const repsStr = (ex: StrengthEx) => (ex.reps_type === 'secs' ? `${ex.reps}s` : `${ex.reps}`);

// Clean exercise list — one hairline-separated row per exercise: name (+ muscle
// group) on the left, prescribed sets × reps (· weight) on the right. Mirrors
// the run's WorkoutDetail rows. Shared by the dashboard StrengthHero, the
// tomorrow/future SessionRows, and the plan StrengthRow; each caller supplies
// its own padding wrapper.
export function StrengthDetailTable({ exercises }: { exercises: StrengthEx[] }) {
  return (
    <div className="flex flex-col">
      {exercises.map((ex, i) => {
        const weighted = ex.weight != null && Number(ex.weight) > 0;
        return (
          <div key={i} className="flex items-start gap-[12px] py-[9px] border-t border-fog/60 first:border-t-0">
            <div className="flex-1 min-w-0">
              <div className="text-[14.5px] font-medium text-ink leading-snug">{ex.name}</div>
              {ex.target && (
                <div className="font-mono text-[11.5px] tracking-[.04em] text-stone mt-[2px]">{ex.target}</div>
              )}
            </div>
            <div className="shrink-0 text-right whitespace-nowrap leading-snug pt-[1px]">
              <span className="font-display font-semibold text-[14.5px] text-ink tabular-nums">{ex.sets} × {repsStr(ex)}</span>
              {weighted && <span className="font-mono text-[12.5px] text-stone tabular-nums"> · {ex.weight} kg</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// A strength session row — compact (duration + focus), expandable to the
// prescribed exercises + an optional note.
export default function StrengthRow({
  short, date, focus, duration, today, done, note, exercises = [], compact = false, title = 'Strength', next = false,
}: {
  short?: string; date?: string; focus: string | null; duration: string | null;
  today?: boolean; done?: boolean; note?: string | null; exercises?: StrengthEx[]; compact?: boolean; title?: string; next?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasDetail = exercises.length > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-[14px] border-l-[3px] px-[16px] py-[12px] transition-colors ${today ? 'bg-oxblood-soft/35' : ''} ${hasDetail ? 'cursor-pointer select-none hover:bg-fog/15' : ''}`}
        style={{ borderLeftColor: GOLD }}
        onClick={hasDetail ? () => setOpen(o => !o) : undefined}
        role={hasDetail ? 'button' : undefined}
        tabIndex={hasDetail ? 0 : undefined}
        aria-expanded={hasDetail ? open : undefined}
        onKeyDown={hasDetail ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); } } : undefined}
      >
        {!compact && (
          <div className="w-[46px] shrink-0">
            <div className="font-display font-semibold text-[16px] leading-none text-ink">{short}</div>
            <div className="font-mono text-[12.5px] text-stone mt-[4px]">{date}</div>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-[7px] leading-tight">
            {next && (
              <span className="font-mono text-[11px] tracking-[.12em] uppercase text-oxblood border border-oxblood/40 rounded-[4px] px-[5px] py-[1px] shrink-0">Next up</span>
            )}
            {done && <span className="text-fern text-[15px] leading-none shrink-0">✓</span>}
            <Dumbbell size={15} className="text-stone shrink-0" />
            <span className="text-[16.5px] font-semibold text-ink">{title}</span>
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
