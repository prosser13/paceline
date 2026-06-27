'use client';

import { useState } from 'react';
import { humanHMM } from './session-ui';
import { YogaGlyph } from './glyphs';
import { COFFEE, FERN, BONE } from '@/lib/colors';
import { type YogaPose, YogaDetailTable } from './YogaRow';

// Dashboard hero for a yoga session — mirrors StrengthHero (coloured header,
// title + descriptor, a "The flow" accordion with the poses) but rails in EMBER
// and has no CTA: yoga is mobility/stretch guidance, not a tracked sets/reps
// session, so completion comes from a matched Strava activity.
export default function YogaHero({
  label, focus, duration, note, poses, done = false,
}: {
  label: string; focus: string | null; duration: string | null;
  note: string | null; poses: YogaPose[]; done?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-fog rounded-[18px] overflow-hidden bg-paper mb-[18px]">
      {/* Header bar — ember when planned, fern when completed */}
      <div className="flex items-center justify-between px-[18px] sm:px-[26px] py-[12px]" style={{ background: done ? FERN : COFFEE, color: BONE }}>
        <span className="font-display font-semibold text-[18px] uppercase tracking-[.05em] leading-none">{label}</span>
        {done && (
          <span className="flex items-center gap-[7px] font-mono text-[13px]">
            ✓ Completed
            <svg width="13" height="13" viewBox="0 0 24 24" fill={BONE} role="img" aria-label="Strava">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
            </svg>
          </span>
        )}
      </div>

      <div className="px-[18px] py-[18px] sm:p-[22px_26px]">
        <div className="flex justify-between items-start gap-4 sm:gap-6">
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-[22px] sm:text-[30px] mt-[1px] mb-[5px] leading-tight flex items-center gap-[10px]">
              <span style={{ color: COFFEE }}><YogaGlyph size={24} /></span>{focus ?? 'Yoga'}
            </h3>
            {note && <div className="text-[15px] text-stone">{note}</div>}
          </div>
          <div className="shrink-0 text-right">
            <div className="font-display font-semibold text-[24px] sm:text-[30px] leading-none text-ink">{humanHMM(duration) ?? '—'}</div>
            <div className="font-mono text-[14px] text-stone mt-[3px]">{poses.length} poses</div>
          </div>
        </div>

        <div className="mt-[18px]">
          <button type="button" onClick={() => setOpen(o => !o)} className="flex items-center justify-between w-full min-h-[40px] cursor-pointer select-none">
            <span className="text-[14px] font-semibold text-stone">Session detail</span>
            <span className="font-mono text-[15px] text-stone leading-none"
              style={{ display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>▾</span>
          </button>

          {open && (
            <div className="mt-[10px] -mx-[18px] sm:-mx-[26px] border-l-2 border-fog pl-[18px] pr-[18px] sm:pl-[26px] sm:pr-[26px]">
              <YogaDetailTable poses={poses} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
