'use client';

import { useState } from 'react';
import { humanHMM } from './session-ui';
import { YogaGlyph } from './glyphs';
import { EMBER } from '@/lib/colors';

// Yoga reuses the strength prescription shape (name + reps), but renders a
// pose-oriented table: no sets/load column, reps shown as a hold (secs) or a
// movement count. `target` carries an optional "per side" / area chip.
export interface YogaPose {
  name: string;
  reps: number;
  reps_type?: string;   // 'secs' → a hold; otherwise a movement count
  target?: string | null;
}

const holdStr = (p: YogaPose) => (p.reps_type === 'secs' ? `${p.reps}s` : `×${p.reps}`);

// The pose list — clean hairline rows matching the run / strength detail. Pose
// names wrap (no truncation) so they stay readable on mobile.
export function YogaDetailTable({ poses }: { poses: YogaPose[] }) {
  return (
    <div className="flex flex-col">
      {poses.map((p, i) => (
        <div key={i} className="flex items-start gap-[12px] py-[9px] border-t border-fog/60 first:border-t-0">
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-medium text-ink leading-snug">{p.name}</div>
            {p.target && <div className="font-mono text-[11.5px] text-stone mt-[1px]">{p.target}</div>}
          </div>
          <div className="shrink-0 text-right font-display font-semibold text-[14px] text-ink tabular-nums whitespace-nowrap pt-[1px]">{holdStr(p)}</div>
        </div>
      ))}
    </div>
  );
}

// A yoga session row — mirrors StrengthRow (compact + dated variants) but rails
// in EMBER and expands to the flow's poses. Yoga has no active-session flow, so
// it is display-only (completion comes from a matched Strava activity).
export default function YogaRow({
  short, date, focus, duration, today, done, note, poses = [], compact = false, emphasis = false, next = false,
}: {
  short?: string; date?: string; focus: string | null; duration: string | null;
  today?: boolean; done?: boolean; note?: string | null; poses?: YogaPose[]; compact?: boolean; emphasis?: boolean; next?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasDetail = poses.length > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-[14px] border-l-[3px] transition-colors ${emphasis ? 'px-[18px] py-[15px]' : 'px-[16px] py-[12px]'} ${today ? 'bg-oxblood-soft/35' : ''} ${hasDetail ? 'cursor-pointer select-none hover:bg-fog/15' : ''}`}
        style={{ borderLeftColor: EMBER }}
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
            <span style={{ color: EMBER }} className="shrink-0"><YogaGlyph size={emphasis ? 18 : 15} /></span>
            <span className={`${emphasis ? 'text-[18px]' : 'text-[16.5px]'} font-semibold text-ink`}>Yoga</span>
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
          {hasDetail && <div className="font-mono text-[12px] text-stone mt-[3px]">{poses.length} poses</div>}
        </div>
      </div>

      {open && hasDetail && (
        <div className="border-l-2 border-fog pl-[16px] pr-[16px] py-[10px]">
          <YogaDetailTable poses={poses} />
          {note && <div className="text-[13.5px] text-stone leading-snug mt-[8px]">{note}</div>}
        </div>
      )}
    </div>
  );
}
