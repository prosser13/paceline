'use client';

// Manual RPE (1–10) for completed NON-run activities (ride / strength / yoga).
// Runs pull their RPE from Garmin via intervals.icu and stay read-only; this is the
// only entry path for the rest. Quiet until set ("Rate effort"), then shows the
// value; tap it to change. Writes perceived_effort via a server action.
//
// NOTE (deferred): no 48h backfill lock yet — editable any time. Add once the
// completion date is threaded through.

import { useState, useTransition } from 'react';
import { rateEffort } from '@/app/(app)/plan/effort-actions';

// Word anchors at the ends + middle, so the scale reads without a legend.
const ANCHOR: Record<number, string> = { 1: 'easy', 5: 'moderate', 8: 'hard', 10: 'max' };

export default function EffortScale({ sessionId, value }: { sessionId: string; value: number | null }) {
  const [rpe, setRpe] = useState<number | null>(value);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function choose(n: number) {
    setRpe(n);
    setOpen(false);
    start(() => rateEffort(sessionId, n));
  }

  // Collapsed states: a set value (tap to change) or a quiet prompt.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-[5px] font-mono text-[11px] font-bold rounded-[5px] border border-fog px-[7px] py-[2px] text-stone hover:text-ink transition-colors"
      >
        {rpe != null ? <>RPE {rpe}<span className="text-stone/60 font-medium">/10</span></> : 'Rate effort'}
        {pending && <span className="text-stone/50">…</span>}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-[4px] flex-wrap">
      <span className="font-mono text-[10px] uppercase tracking-[.08em] text-stone mr-[2px]">Effort</span>
      {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
        <button
          key={n}
          type="button"
          onClick={() => choose(n)}
          title={ANCHOR[n] ? `${n} · ${ANCHOR[n]}` : String(n)}
          aria-label={ANCHOR[n] ? `${n} — ${ANCHOR[n]}` : `${n}`}
          className={`w-[24px] h-[24px] rounded-[6px] text-[11px] font-bold border transition-colors ${
            n === rpe ? 'bg-hard text-bone border-hard' : 'bg-bone text-stone border-fog hover:border-stone'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
