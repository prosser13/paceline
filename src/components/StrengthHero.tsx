'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { type StrengthEx, StrengthDetailTable } from './StrengthRow';
import { humanHMM } from './session-ui';
import { Dumbbell } from './glyphs';
import { GOLD, FERN, BONE } from '@/lib/colors';
import { startPlannedSession } from '@/app/(app)/strength/actions';

// A bordered stat box — value over a mono unit label, matching the run hero's
// completed-stats and the mobile prototype's Today card.
function Stat({ v, u }: { v: React.ReactNode; u: string }) {
  return (
    <div className="border border-fog bg-bone rounded-[12px] px-[12px] py-[11px]">
      <div className="font-display font-semibold text-[21px] leading-none text-ink tabular-nums">{v}</div>
      <div className="font-mono text-[10.5px] tracking-[.07em] uppercase text-stone mt-[5px]">{u}</div>
    </div>
  );
}

// Dashboard hero for a strength session — mirrors the run SessionHero: coloured
// header (Today · Strength), short session name + descriptor, three stat boxes
// (duration / exercises / sets), a "Session detail" accordion with the clean
// exercise rows, and a CTA that loads the planned session.
export default function StrengthHero({
  label, planSessionId, focus, duration, note, exercises, done = false,
}: {
  label: string; planSessionId: string; focus: string | null; duration: string | null;
  note: string | null; exercises: StrengthEx[]; done?: boolean;
}) {
  const [open, setOpen] = useState(false); // strength detail collapsed by default
  const [pending, start] = useTransition();
  const router = useRouter();

  // Short title: drop the muscle-group tail after an em/en-dash or middot
  // ("Upper body — chest, back, shoulders, arms" → "Upper body"). The groups
  // still show per-exercise in the detail rows.
  const shortFocus = focus ? focus.split(/\s*[—–·]\s*/)[0].trim() : null;
  const totalSets = exercises.reduce((sum, ex) => sum + (ex.sets ?? 0), 0);

  function go() {
    start(async () => {
      const r = await startPlannedSession(planSessionId);
      if (r.ok) router.push(`/strength/session/${r.shortId}`);
    });
  }

  return (
    <div className="border border-fog rounded-[18px] overflow-hidden bg-paper mb-[18px]">
      {/* Header bar — gold when planned, fern when completed */}
      <div className="flex items-center justify-between px-[18px] sm:px-[26px] py-[12px]" style={{ background: done ? FERN : GOLD, color: BONE }}>
        <span className="font-display font-semibold text-[18px] uppercase tracking-[.05em] leading-none">{label} · Strength</span>
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
        {/* Title + description */}
        <h3 className="font-display font-semibold text-[22px] sm:text-[30px] mt-[1px] mb-[5px] leading-tight flex items-center gap-[10px]">
          <Dumbbell size={24} className="shrink-0 text-ink" />{shortFocus ?? 'Strength'}
        </h3>
        {note && <div className="text-[13px] text-stone leading-snug">{note}</div>}

        {/* Stat boxes — duration / exercises / sets */}
        <div className="grid grid-cols-3 gap-[9px] mt-[16px]">
          <Stat v={humanHMM(duration) ?? '—'} u="dur" />
          <Stat v={exercises.length} u="exercises" />
          <Stat v={totalSets} u="sets" />
        </div>

        {/* Session detail accordion */}
        <div className="mt-[18px]">
          <button type="button" onClick={() => setOpen(o => !o)} className="flex items-center justify-between w-full min-h-[40px] cursor-pointer select-none">
            <span className="text-[14px] font-semibold text-stone">Session detail</span>
            <span className="font-mono text-[15px] text-stone leading-none"
              style={{ display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>▾</span>
          </button>

          {open && (
            <div className="mt-[10px] -mx-[18px] sm:-mx-[26px] border-l-2 border-fog pl-[18px] pr-[18px] sm:pl-[26px] sm:pr-[26px]">
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
