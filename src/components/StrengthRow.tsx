'use client';

import { useState } from 'react';

export interface StrengthEx {
  name: string;
  sets: number;
  reps: number;
  reps_type?: string;
  weight?: number | null;
}

function fmtEx(ex: StrengthEx): string {
  const r = ex.reps_type === 'secs' ? `${ex.reps}s` : `${ex.reps}`;
  let s = `${ex.sets} × ${r}`;
  if (ex.weight != null && Number(ex.weight) > 0) s += ` @ ${ex.weight}kg`;
  return s;
}

function Dumbbell() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-stone shrink-0" aria-hidden="true">
      <path d="M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11" />
    </svg>
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
            <Dumbbell />
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
          <div className="font-display font-semibold text-[19px] leading-none text-ink">{duration ?? '—'}</div>
        </div>
      </div>

      {open && hasDetail && (
        <div className="border-t border-fog/60 bg-bone/40 pl-[60px] pr-[18px] py-[12px]">
          {note && (
            <p className="text-[13.5px] text-stone leading-snug border-l-[3px] border-l-stone/40 pl-[10px] mb-[10px]">{note}</p>
          )}
          <div className="flex flex-col gap-[7px]">
            {exercises.map((ex, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <span className="text-[14.5px] text-ink">{ex.name}</span>
                <span className="font-mono text-[13px] text-stone tabular-nums shrink-0">{fmtEx(ex)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
