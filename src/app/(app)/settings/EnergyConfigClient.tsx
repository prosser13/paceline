'use client';

import { useState, useTransition } from 'react';
import { saveBmr, saveActivity } from './actions';

const INPUT =
  'bg-bone border border-fog rounded-[6px] px-2 py-[5px] font-mono text-[13px] text-ink focus:outline-none focus:border-stone transition-colors';

export default function EnergyConfigClient({ initialBmr, initialActivity }: { initialBmr: number | null; initialActivity: number }) {
  const [bmr, setBmr] = useState(initialBmr != null ? String(initialBmr) : '');
  const [activity, setActivity] = useState(String(initialActivity));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () => start(async () => {
    setMsg(null);
    const [a, b] = await Promise.all([saveBmr(bmr), saveActivity(activity)]);
    setMsg(a.ok && b.ok ? 'Saved' : (a.error ?? b.error ?? 'Failed'));
  });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-stone">
        Powers the dashboard&rsquo;s daily calorie target. Your <strong>base metabolic rate</strong> is
        the calories you&rsquo;d burn at rest — enter the figure Garmin or intervals.icu gives you. The
        <strong> activity factor</strong> scales it for everyday non-exercise activity (1.3 ≈ lightly
        active desk day); your planned training is added on top automatically.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[11px] uppercase tracking-[.08em] text-stone">Base rate (kcal/day)</label>
          <input value={bmr} onChange={e => { setBmr(e.target.value); setMsg(null); }}
                 inputMode="numeric" placeholder="1750" className={`${INPUT} w-[120px]`} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[11px] uppercase tracking-[.08em] text-stone">Activity factor</label>
          <input value={activity} onChange={e => { setActivity(e.target.value); setMsg(null); }}
                 inputMode="decimal" placeholder="1.3" className={`${INPUT} w-[120px]`} />
        </div>
        <button type="button" onClick={save} disabled={pending || !bmr.trim() || !activity.trim()}
          className="bg-oxblood text-bone text-[13px] font-medium px-4 py-[8px] rounded-[8px] hover:bg-oxblood-dark transition-colors disabled:opacity-50">
          {pending ? 'Saving…' : 'Save'}
        </button>
        {msg && <span className="font-mono text-[11px] text-fern self-center">{msg}</span>}
      </div>
    </div>
  );
}
