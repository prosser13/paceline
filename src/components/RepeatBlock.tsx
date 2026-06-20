'use client';

import { useState } from 'react';
import type { NormRepeat } from '@/lib/plan-structure';
import { PhaseLine, AggregateLine } from '@/components/session-ui';

// A repeat block. When the session is completed it collapses to one averaged
// row per sub-type (with a count verdict) and expands to the individual reps
// (Stride 1, Stride 2, …). Not-yet-run repeats just list the planned sub-steps.
export default function RepeatBlock({ step }: { step: NormRepeat }) {
  const [open, setOpen] = useState(false);

  if (!step.perRep) {
    return (
      <div className="mt-[8px] mb-[14px] pl-[12px] border-l-2 border-fog/60">
        <div className="font-mono text-[12px] text-stone uppercase tracking-[.08em] mb-[2px]">
          {step.count}× repeat
        </div>
        {step.steps.map((s, j) => <PhaseLine key={j} seg={s} />)}
      </div>
    );
  }

  const perRep = step.perRep;
  return (
    <div className="mt-[8px] mb-[14px] pl-[12px] border-l-2 border-fog/60">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex items-center gap-[6px] cursor-pointer select-none mb-[3px]"
      >
        <span
          className="font-mono text-[12px] text-stone leading-none"
          style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }}
        >
          ▸
        </span>
        <span className="font-mono text-[12px] text-stone uppercase tracking-[.08em]">{step.count}× repeat</span>
        <span className="font-mono text-[11px] text-stone/70">· {open ? 'collapse' : 'break out reps'}</span>
      </button>

      {open
        ? Array.from({ length: step.count }, (_, r) =>
            perRep.map((reps, j) => <PhaseLine key={`${r}-${j}`} seg={reps[r]} />))
        : step.steps.map((s, j) => <AggregateLine key={j} sub={s} reps={perRep[j]} count={step.count} />)}
    </div>
  );
}
