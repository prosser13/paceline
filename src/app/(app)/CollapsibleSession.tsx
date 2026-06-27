'use client';

import { useState } from 'react';
import { WorkoutDetail, CompareTable, type CompareRow } from '@/components/session-ui';
import type { NormStep } from '@/lib/plan-structure';

export default function CollapsibleSession({
  steps, defaultOpen, compareRows, isRace = false,
}: {
  steps: NormStep[];
  defaultOpen: boolean;
  compareRows?: CompareRow[] | null;   // completed → show the Plan/Actual/Δ table above the segments
  isRace?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!steps.length) return null;

  // Snug to the card bottom when collapsed (mt only above), roomier when open.
  return (
    <div className={open ? 'mt-[18px]' : 'mt-[14px]'}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full min-h-[40px] cursor-pointer select-none"
      >
        <span className="text-[14px] font-semibold text-stone">Session detail</span>
        <span
          className="font-mono text-[15px] text-stone leading-none"
          style={{ display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="mt-[9px]">
          {compareRows && compareRows.length > 0 && (
            <div className="mb-[10px]"><CompareTable rows={compareRows} /></div>
          )}
          <WorkoutDetail steps={steps} variant="card" isRace={isRace} />
        </div>
      )}
    </div>
  );
}
