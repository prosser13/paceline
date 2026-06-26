'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { type StrengthEx, StrengthDetailTable } from './StrengthRow';
import { humanHMM } from './session-ui';
import { Dumbbell } from './glyphs';
import { GOLD, FERN, BONE } from '@/lib/colors';
import { startPlannedSession } from '@/app/(app)/strength/actions';

// Dashboard hero for a strength session — mirrors the run SessionHero: coloured
// header (label), session name + descriptor in the body, a "The session"
// accordion with the exercises (in order, with a muscle-group pill), and a CTA
// that loads the planned session.
export default function StrengthHero({
  label, planSessionId, focus, duration, note, exercises, done = false,
}: {
  label: string; planSessionId: string; focus: string | null; duration: string | null;
  note: string | null; exercises: StrengthEx[]; done?: boolean;
}) {
  const [open, setOpen] = useState(false); // strength detail is less critical than the run — collapsed by default
  const [pending, start] = useTransition();
  const router = useRouter();

  function go() {
    start(async () => {
      const r = await startPlannedSession(planSessionId);
      if (r.ok) router.push(`/strength/session/${r.shortId}`);
    });
  }

  return (
    <div className="border border-fog rounded-[18px] overflow-hidden bg-paper mb-[18px]">
      {/* Header bar — gold when planned, fern when completed */}
      <div className="flex items-center justify-between px-[26px] py-[12px]" style={{ background: done ? FERN : GOLD, color: BONE }}>
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

      <div className="p-[22px_26px]">
        {/* Title + metric */}
        <div className="flex justify-between items-start gap-6">
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-[30px] mt-[1px] mb-[5px] leading-tight flex items-center gap-[10px]">
              <Dumbbell size={24} className="shrink-0 text-ink" />{focus ?? 'Strength'}
            </h3>
            {note && <div className="text-[15px] text-stone">{note}</div>}
          </div>
          <div className="shrink-0 text-right">
            <div className="font-display font-semibold text-[30px] leading-none text-ink">{humanHMM(duration) ?? '—'}</div>
            <div className="font-mono text-[14px] text-stone mt-[3px]">{exercises.length} exercises</div>
          </div>
        </div>

        {/* The session accordion */}
        <div className="mt-[18px]">
          <button type="button" onClick={() => setOpen(o => !o)} className="flex items-center gap-[8px] cursor-pointer select-none">
            <span className="font-mono text-[13px] tracking-[.12em] uppercase text-stone">The session</span>
            <span className="font-mono text-[13px] text-stone leading-none"
              style={{ display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>▾</span>
          </button>

          {open && (
            <div className="mt-[9px] border border-fog rounded-[12px] bg-bone px-[16px] py-[10px]">
              <StrengthDetailTable exercises={exercises} />
            </div>
          )}
        </div>

        {!done && (
          <button type="button" onClick={go} disabled={pending}
            className="flex items-center justify-center gap-[8px] w-full bg-oxblood text-bone text-[15px] font-medium py-[12px] rounded-[10px] hover:bg-oxblood-dark transition-colors disabled:opacity-50 mt-[16px]">
            {pending ? 'Loading…' : 'Do this session →'}
          </button>
        )}
      </div>
    </div>
  );
}
