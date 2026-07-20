'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { type StrengthEx, StrengthDetailTable } from './StrengthRow';
import EffortScale from './EffortScale';
import { humanHMM } from './session-ui';
import { Dumbbell } from './glyphs';
import { STRENGTH, READY } from '@/lib/colors';
import { startPlannedSession } from '@/app/(app)/strength/actions';

// Dashboard hero for a strength session — matches the mockup's Today strength
// card: a light card with a "Strength · <focus>" eyebrow, a "<dur> · N exercises"
// headline, a Start pill, and an expandable exercise table. Done sessions show a
// ✓ and drop the Start button.
export default function StrengthHero({
  planSessionId, focus, duration, note, exercises, done = false, perceivedEffort = null, kcal = null,
}: {
  label?: string; planSessionId: string; focus: string | null; duration: string | null;
  note: string | null; exercises: StrengthEx[]; done?: boolean;
  perceivedEffort?: number | null;   // manual RPE (7B) — scale shows when done
  kcal?: string | null;   // per-session calorie label (est/actual)
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  // Split on the em-dash / middle-dot separators (optionally spaced) or a *spaced*
  // en-dash — never a bare en-dash, so a numeric range like "20–30 min" isn't cut
  // to "20".
  const shortFocus = focus ? focus.split(/\s*[—·]\s*|\s+–\s+/)[0].trim() : null;
  const dur = humanHMM(duration);
  const headline = [dur, exercises.length ? `${exercises.length} exercises` : null].filter(Boolean).join(' · ') || 'Strength';

  function go() {
    start(async () => {
      const r = await startPlannedSession(planSessionId);
      if (r.ok) router.push(`/strength/session/${r.shortId}`);
    });
  }

  return (
    <div className="border border-fog rounded-[16px] bg-paper" style={{ padding: '18px 22px', marginBottom: '10px' }}>
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full text-left cursor-pointer select-none group">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              <div className="text-[11px] uppercase font-bold inline-flex items-center gap-[6px]" style={{ letterSpacing: '.06em', color: done ? READY : STRENGTH }}>
                <Dumbbell size={14} className="" />
                {done ? 'Strength · done ✓' : `Strength${shortFocus ? ` · ${shortFocus}` : ''}`}
              </div>
              <div className="font-display font-bold text-[24px] leading-tight" style={{ marginTop: '3px' }}>{headline}</div>
              {kcal && <div className="text-[12px] font-semibold text-stone" style={{ marginTop: '2px' }}>{kcal}</div>}
            </div>
            <svg className="shrink-0 text-stone" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </div>
          {!done && (
            <span
              role="button" tabIndex={0}
              onClick={e => { e.stopPropagation(); if (!pending) go(); }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (!pending) go(); } }}
              className="shrink-0 inline-flex items-center gap-[6px] text-[13px] font-bold text-white cursor-pointer disabled:opacity-50"
              style={{ background: STRENGTH, padding: '9px 18px', borderRadius: '24px', opacity: pending ? 0.6 : 1 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
              {pending ? 'Loading…' : 'Start'}
            </span>
          )}
        </div>
      </button>

      {note && <div className="text-[13px] text-stone leading-snug mt-[8px]">{note}</div>}

      {done && <div className="mt-[10px]"><EffortScale sessionId={planSessionId} value={perceivedEffort} /></div>}

      {open && (
        <div className="border-t border-fog mt-[14px] pt-[12px]">
          <StrengthDetailTable exercises={exercises} weightCol />
        </div>
      )}
    </div>
  );
}
