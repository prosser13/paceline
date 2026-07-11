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
// dashboard TomorrowCard, and the plan StrengthRow; each caller supplies its own
// padding wrapper.
export function StrengthDetailTable({ exercises, weightCol = false }: { exercises: StrengthEx[]; weightCol?: boolean }) {
  // weightCol (dashboard today hero): a 3-column row — name · sets×reps · weight
  // (in the strength accent), no muscle group — matching the design mockup.
  if (weightCol) {
    return (
      <div className="flex flex-col">
        {exercises.map((ex, i) => {
          const weighted = ex.weight != null && Number(ex.weight) > 0;
          return (
            <div key={i} className="grid items-center py-[8px] border-t border-fog/60 first:border-t-0 text-[13px]" style={{ gridTemplateColumns: '1fr 74px 96px' }}>
              <span className="font-medium text-ink min-w-0 truncate">{ex.name}</span>
              <span className="text-left font-semibold text-ink tabular-nums">{ex.sets} × {repsStr(ex)}</span>
              <span className="text-right font-semibold tabular-nums" style={{ color: GOLD }}>{weighted ? `${ex.weight} kg` : 'bw'}</span>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      {exercises.map((ex, i) => {
        const weighted = ex.weight != null && Number(ex.weight) > 0;
        return (
          <div key={i} className="flex items-start gap-[12px] py-[9px] border-t border-fog/60 first:border-t-0">
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium text-ink leading-snug">{ex.name}</div>
              {ex.target && <div className="font-mono text-[11.5px] text-stone mt-[1px]">{ex.target}</div>}
            </div>
            <div className="shrink-0 text-right leading-snug pt-[1px]">
              <div className="font-display font-semibold text-[14px] text-ink tabular-nums whitespace-nowrap">{ex.sets} × {repsStr(ex)}</div>
              {weighted && <div className="font-mono text-[11px] text-stone mt-[1px]">{ex.weight} kg</div>}
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
  short, date, focus, duration, today, done, note, exercises = [], compact = false, title = 'Strength', next = false, emphasis = false,
}: {
  short?: string; date?: string; focus: string | null; duration: string | null;
  today?: boolean; done?: boolean; note?: string | null; exercises?: StrengthEx[]; compact?: boolean; title?: string; next?: boolean; emphasis?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasDetail = exercises.length > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-[14px] border-l-[3px] ${emphasis ? 'px-[18px] py-[15px]' : 'px-[16px] py-[12px]'} transition-colors ${today ? 'bg-oxblood-soft/35' : ''} ${hasDetail ? 'cursor-pointer select-none hover:bg-fog/15' : ''}`}
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
            <Dumbbell size={emphasis ? 18 : 15} className="text-stone shrink-0" />
            <span className={`${emphasis ? 'text-[18px]' : 'text-[16.5px]'} font-semibold text-ink`}>{title}</span>
            {hasDetail && (
              <span className="font-mono text-[14px] text-stone leading-none"
                style={{ display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>
                ▾
              </span>
            )}
          </div>
          {focus && <div className="text-[14.5px] leading-snug mt-[3px] text-stone">{focus}</div>}
        </div>
        <div className="shrink-0 text-right w-[78px]">
          <div className={`font-display font-semibold ${emphasis ? 'text-[20px]' : 'text-[19px]'} leading-none text-ink`}>{humanHMM(duration) ?? '—'}</div>
        </div>
      </div>

      {open && hasDetail && (
        <div className="border-l-2 border-fog pl-[16px] pr-[16px] py-[10px]">
          <StrengthDetailTable exercises={exercises} />

          {note && <div className="text-[13.5px] text-stone leading-snug mt-[8px]">{note}</div>}
        </div>
      )}
    </div>
  );
}
