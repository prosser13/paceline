'use client';

import { useState, useTransition } from 'react';
import { saveStrengthPriority } from './actions';
import type { PlanPrefRow } from '@/data/plans';

interface Props {
  plans: PlanPrefRow[];
}

const KIND_LABEL: Record<string, string> = {
  race:     'Race',
  recovery: 'Recovery',
  base:     'Base',
};

export default function PlanPrefsClient({ plans }: Props) {
  return (
    <div className="flex flex-col divide-y divide-fog">
      {plans.map(p => <PlanRow key={p.id} plan={p} />)}
    </div>
  );
}

function PlanRow({ plan }: { plan: PlanPrefRow }) {
  const [on, setOn]      = useState(plan.strength_priority);
  const [pending, start] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next);            // optimistic
    start(async () => {
      const res = await saveStrengthPriority(plan.id, next);
      if (!res?.ok) setOn(!next);  // revert on failure
    });
  }

  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-[15px] text-ink font-medium truncate">{plan.name}</div>
        <div className="font-mono text-[11px] uppercase tracking-[.08em] text-stone/70">
          {KIND_LABEL[plan.kind] ?? plan.kind} · {on ? 'Strength first' : 'Run first'}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`Strength priority for ${plan.name}`}
        onClick={toggle}
        disabled={pending}
        className={`relative w-[42px] h-[24px] rounded-full shrink-0 transition-colors disabled:opacity-50 ${
          on ? 'bg-oxblood' : 'bg-fog'
        }`}
      >
        <span
          className={`absolute top-[2px] left-[2px] w-[20px] h-[20px] rounded-full bg-bone shadow-sm transition-transform ${
            on ? 'translate-x-[18px]' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
