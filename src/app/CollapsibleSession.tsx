'use client';

import { useState } from 'react';
import { WorkoutDetail } from '@/components/session-ui';
import type { NormStep } from '@/lib/plan-structure';

export default function CollapsibleSession({
  steps, defaultOpen,
}: {
  steps: NormStep[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!steps.length) return null;

  return (
    <div className="mt-[18px]">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-[8px] cursor-pointer select-none"
      >
        <span className="font-mono text-[13px] tracking-[.12em] uppercase text-stone">The session</span>
        <span
          className="font-mono text-[13px] text-stone leading-none"
          style={{ display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="mt-[9px]">
          <WorkoutDetail steps={steps} variant="card" />
        </div>
      )}
    </div>
  );
}
