'use client';

import { useState, useTransition } from 'react';
import { saveStrengthProgressionMode } from './actions';
import type { ProgressionMode } from '@/data/strength-progression-rules';

const OPTIONS: { key: ProgressionMode; label: string; desc: string }[] = [
  { key: 'hybrid', label: 'Hybrid', desc: 'Upper body builds; legs & core hold an injury-proofing load.' },
  { key: 'progressive', label: 'Progressive', desc: 'Everything climbs — reps then weight — as it gets easy.' },
  { key: 'maintenance', label: 'Maintenance', desc: 'Hold loads everywhere; strength just supports running.' },
];

export default function StrengthProgressionClient({ initialMode }: { initialMode: ProgressionMode }) {
  const [mode, setMode] = useState<ProgressionMode>(initialMode);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function choose(m: ProgressionMode) {
    if (m === mode) return;
    setMode(m);
    setSaved(false);
    start(async () => {
      await saveStrengthProgressionMode(m);
      setSaved(true);
    });
  }

  return (
    <div>
      <div className="flex flex-col gap-[8px]">
        {OPTIONS.map(o => {
          const on = mode === o.key;
          return (
            <button key={o.key} type="button" onClick={() => choose(o.key)} aria-pressed={on} disabled={pending}
              className={`text-left rounded-[12px] border transition-colors ${on ? 'bg-hero text-onhero border-hero' : 'bg-paper border-fog'}`}
              style={{ padding: '11px 14px' }}>
              <div className="text-[14px] font-bold">{o.label}</div>
              <div className={`text-[12px] leading-snug mt-[2px] ${on ? 'text-onhero/70' : 'text-stone'}`}>{o.desc}</div>
            </button>
          );
        })}
      </div>
      {saved && <div className="text-[12px] text-fern mt-[8px]">Saved.</div>}
    </div>
  );
}
