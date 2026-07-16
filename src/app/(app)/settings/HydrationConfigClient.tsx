'use client';

import { useState, useTransition } from 'react';
import { saveSweatSodium, saveGutCap } from './actions';

const INPUT =
  'bg-bone border border-fog rounded-[6px] px-2 py-[5px] font-mono text-[13px] text-ink focus:outline-none focus:border-stone transition-colors';

export default function HydrationConfigClient({ initialSweatSodium, initialGutCap }: { initialSweatSodium: number; initialGutCap: number }) {
  const [sodium, setSodium] = useState(String(initialSweatSodium));
  const [cap, setCap] = useState(String(initialGutCap));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () => start(async () => {
    setMsg(null);
    const [a, b] = await Promise.all([saveSweatSodium(sodium), saveGutCap(cap)]);
    setMsg(a.ok && b.ok ? 'Saved' : (a.error ?? b.error ?? 'Failed'));
  });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-stone">
        From a sweat test — the sodium lost per litre of sweat sets the sodium side of your
        estimates. The gut cap limits the personalised race fluid target (you can only absorb so
        much per hour); the default is 800 ml/h, raise it if your gut is trained for more.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[11px] uppercase tracking-[.08em] text-stone">Sweat sodium (mg/L)</label>
          <input value={sodium} onChange={e => { setSodium(e.target.value); setMsg(null); }}
                 inputMode="numeric" placeholder="553" className={`${INPUT} w-[120px]`} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[11px] uppercase tracking-[.08em] text-stone">Fluid gut cap (ml/h)</label>
          <input value={cap} onChange={e => { setCap(e.target.value); setMsg(null); }}
                 inputMode="numeric" placeholder="800" className={`${INPUT} w-[120px]`} />
        </div>
        <button type="button" onClick={save} disabled={pending || !sodium.trim() || !cap.trim()}
          className="bg-oxblood text-bone text-[13px] font-medium px-4 py-[8px] rounded-[8px] hover:bg-oxblood-dark transition-colors disabled:opacity-50">
          {pending ? 'Saving…' : 'Save'}
        </button>
        {msg && <span className="font-mono text-[11px] text-fern self-center">{msg}</span>}
      </div>
    </div>
  );
}
