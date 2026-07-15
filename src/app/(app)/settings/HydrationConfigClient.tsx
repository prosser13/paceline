'use client';

import { useState, useTransition } from 'react';
import { saveSweatSodium } from './actions';

const INPUT =
  'bg-bone border border-fog rounded-[6px] px-2 py-[5px] font-mono text-[13px] text-ink focus:outline-none focus:border-stone transition-colors';

export default function HydrationConfigClient({ initialSweatSodium }: { initialSweatSodium: number }) {
  const [sodium, setSodium] = useState(String(initialSweatSodium));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () => start(async () => {
    setMsg(null);
    const r = await saveSweatSodium(sodium);
    setMsg(r.ok ? 'Saved' : (r.error ?? 'Failed'));
  });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-stone">
        From a sweat test — the sodium lost per litre of sweat. Sets the sodium side of your
        hydration estimates and race plans.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[11px] uppercase tracking-[.08em] text-stone">Sweat sodium (mg/L)</label>
          <input value={sodium} onChange={e => { setSodium(e.target.value); setMsg(null); }}
                 inputMode="numeric" placeholder="553" className={`${INPUT} w-[120px]`} />
        </div>
        <button type="button" onClick={save} disabled={pending || !sodium.trim()}
          className="bg-oxblood text-bone text-[13px] font-medium px-4 py-[8px] rounded-[8px] hover:bg-oxblood-dark transition-colors disabled:opacity-50">
          {pending ? 'Saving…' : 'Save'}
        </button>
        {msg && <span className="font-mono text-[11px] text-fern self-center">{msg}</span>}
      </div>
    </div>
  );
}
