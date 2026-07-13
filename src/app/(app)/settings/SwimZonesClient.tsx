'use client';

import { useState, useTransition } from 'react';
import { saveSwimZones, type SwimZoneInput } from './actions';

interface Props {
  initialCss: string;      // "m:ss" per 100m
  initialPool: string;     // metres
  initialZones: SwimZoneInput[];
}

const INPUT =
  'bg-bone border border-fog rounded-[6px] px-2 py-[5px] font-mono text-[13px] text-ink focus:outline-none focus:border-stone transition-colors';

type SwimZoneRow = SwimZoneInput & { _key: number };
let nextKey = 0;
const withKey = (z: SwimZoneInput): SwimZoneRow => ({ ...z, _key: nextKey++ });

export default function SwimZonesClient({ initialCss, initialPool, initialZones }: Props) {
  const [css, setCss]   = useState(initialCss);
  const [pool, setPool] = useState(initialPool);
  const [zones, setZones] = useState<SwimZoneRow[]>(
    (initialZones.length ? initialZones : [{ name: '', pace_min: '', pace_max: '' }]).map(withKey),
  );
  const [saved, setSaved] = useState(false);
  const [pending, start]  = useTransition();

  function update(i: number, field: keyof SwimZoneInput, value: string) {
    setZones(zs => zs.map((z, idx) => (idx === i ? { ...z, [field]: value } : z)));
    setSaved(false);
  }
  function addZone() { setZones(zs => [...zs, withKey({ name: '', pace_min: '', pace_max: '' })]); setSaved(false); }
  function removeZone(i: number) { setZones(zs => zs.filter((_, idx) => idx !== i)); setSaved(false); }

  function save() {
    start(async () => {
      await saveSwimZones(css, pool, zones.map(z => ({ name: z.name, pace_min: z.pace_min, pace_max: z.pace_max })));
      setSaved(true);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <label className="font-mono text-[11px] uppercase tracking-[.08em] text-stone w-[120px] shrink-0">
            CSS threshold
          </label>
          <input value={css} onChange={e => { setCss(e.target.value); setSaved(false); }}
            placeholder="1:45" className={`${INPUT} w-[80px] text-center`} />
          <span className="font-mono text-[11px] text-stone">/100m</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="font-mono text-[11px] uppercase tracking-[.08em] text-stone shrink-0">Pool size</label>
          <input value={pool} onChange={e => { setPool(e.target.value); setSaved(false); }}
            placeholder="25" inputMode="numeric" className={`${INPUT} w-[60px] text-center`} />
          <span className="font-mono text-[11px] text-stone">m</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="grid items-center gap-2 font-mono text-[9.5px] uppercase tracking-[.1em] text-stone/70"
             style={{ gridTemplateColumns: '1fr 78px 16px 78px 28px' }}>
          <span>Zone</span><span className="text-center">Fast</span><span /><span className="text-center">Slow</span><span />
        </div>

        {zones.map((z, i) => (
          <div key={z._key} className="grid items-center gap-2" style={{ gridTemplateColumns: '1fr 78px 16px 78px 28px' }}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-[11px] text-stone shrink-0">Z{i + 1}</span>
              <input value={z.name} onChange={e => update(i, 'name', e.target.value)}
                placeholder="Zone name" className={`${INPUT} flex-1 min-w-0 font-sans`} />
            </div>
            <input value={z.pace_min} onChange={e => update(i, 'pace_min', e.target.value)}
              placeholder="1:52" className={`${INPUT} text-center`} />
            <span className="font-mono text-[11px] text-stone text-center">to</span>
            <input value={z.pace_max} onChange={e => update(i, 'pace_max', e.target.value)}
              placeholder="1:59" className={`${INPUT} text-center`} />
            <button type="button" onClick={() => removeZone(i)} aria-label={`Remove zone ${i + 1}`}
              className="font-mono text-[16px] text-stone/50 hover:text-oxblood transition-colors leading-none">×</button>
          </div>
        ))}

        <button type="button" onClick={addZone}
          className="self-start font-mono text-[12px] text-marine hover:text-marine-dark transition-colors mt-1">+ Add zone</button>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button type="button" onClick={save} disabled={pending}
          className="bg-oxblood text-bone text-[13px] font-medium px-4 py-[8px] rounded-[8px] hover:bg-oxblood-dark transition-colors disabled:opacity-50">
          {pending ? 'Saving…' : 'Save zones'}
        </button>
        {saved && !pending && <span className="font-mono text-[11px] text-fern">Saved · pace targets updated across swims</span>}
      </div>
    </div>
  );
}
