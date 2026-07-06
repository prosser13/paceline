'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { refreshRaceSplits } from './actions';

// One-tap upgrade of a race's splits to per-km (sets the RACE session's structure
// to N×1km and recomputes the run's segments from Strava). Only shown when the
// splits aren't per-km yet.
export default function RefreshSplits({ slug }: { slug: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function run() {
    setErr(null);
    start(async () => {
      const res = await refreshRaceSplits(slug);
      if (res.ok) router.refresh();
      else setErr(res.reason ?? 'failed');
    });
  }

  return (
    <div className="border border-fog rounded-[12px] bg-paper px-[16px] py-[12px] mt-[10px]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[13px] text-stone leading-snug">
          Load your per-kilometre splits from the race run.
        </div>
        <button type="button" onClick={run} disabled={pending}
          className="shrink-0 min-h-[38px] px-[14px] rounded-[10px] bg-oxblood text-bone text-[13px] font-semibold hover:bg-oxblood-dark transition-colors disabled:opacity-50">
          {pending ? 'Loading…' : 'Load splits'}
        </button>
      </div>
      {err && <div className="text-[12px] text-oxblood mt-[6px]">Couldn’t load splits ({err}).</div>}
    </div>
  );
}
