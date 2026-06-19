'use client';

import { useState, useTransition } from 'react';
import { saveHrZones, type HrZoneInput } from './actions';

interface Props {
  initialThreshold: string;
  initialMax: string;
  initialResting: string;
  initialZones: HrZoneInput[];
}

const INPUT =
  'bg-bone border border-fog rounded-[6px] px-2 py-[5px] font-mono text-[13px] text-ink focus:outline-none focus:border-stone transition-colors';

export default function HrZonesClient({ initialThreshold, initialMax, initialResting, initialZones }: Props) {
  const [threshold, setThreshold] = useState(initialThreshold);
  const [max, setMax]             = useState(initialMax);
  const [resting, setResting]     = useState(initialResting);
  const [zones, setZones]         = useState<HrZoneInput[]>(
    initialZones.length ? initialZones : [{ name: '', hr_min: '', hr_max: '' }],
  );
  const [saved, setSaved] = useState(false);
  const [pending, start]  = useTransition();

  function update(i: number, field: keyof HrZoneInput, value: string) {
    setZones(zs => zs.map((z, idx) => (idx === i ? { ...z, [field]: value } : z)));
    setSaved(false);
  }

  function addZone() {
    setZones(zs => [...zs, { name: '', hr_min: '', hr_max: '' }]);
    setSaved(false);
  }

  function removeZone(i: number) {
    setZones(zs => zs.filter((_, idx) => idx !== i));
    setSaved(false);
  }

  function save() {
    start(async () => {
      await saveHrZones(threshold, max, resting, zones);
      setSaved(true);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Threshold values */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex items-center gap-2">
          <label className="font-mono text-[11px] uppercase tracking-[.08em] text-stone">Threshold</label>
          <input value={threshold} onChange={e => { setThreshold(e.target.value); setSaved(false); }}
                 placeholder="171" inputMode="numeric" className={`${INPUT} w-[64px] text-center`} />
          <span className="font-mono text-[11px] text-stone">bpm</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="font-mono text-[11px] uppercase tracking-[.08em] text-stone">Max</label>
          <input value={max} onChange={e => { setMax(e.target.value); setSaved(false); }}
                 placeholder="188" inputMode="numeric" className={`${INPUT} w-[64px] text-center`} />
          <span className="font-mono text-[11px] text-stone">bpm</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="font-mono text-[11px] uppercase tracking-[.08em] text-stone">Resting</label>
          <input value={resting} onChange={e => { setResting(e.target.value); setSaved(false); }}
                 placeholder="43" inputMode="numeric" className={`${INPUT} w-[64px] text-center`} />
          <span className="font-mono text-[11px] text-stone">bpm</span>
        </div>
      </div>

      {/* Zones */}
      <div className="flex flex-col gap-2">
        <div className="grid items-center gap-2 font-mono text-[9.5px] uppercase tracking-[.1em] text-stone/70"
             style={{ gridTemplateColumns: '1fr 78px 16px 78px 28px' }}>
          <span>Zone</span>
          <span className="text-center">From</span>
          <span />
          <span className="text-center">To</span>
          <span />
        </div>

        {zones.map((z, i) => (
          <div key={i} className="grid items-center gap-2"
               style={{ gridTemplateColumns: '1fr 78px 16px 78px 28px' }}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-[11px] text-stone shrink-0">Z{i + 1}</span>
              <input
                value={z.name}
                onChange={e => update(i, 'name', e.target.value)}
                placeholder="Zone name"
                className={`${INPUT} flex-1 min-w-0 font-sans`}
              />
            </div>
            <input
              value={z.hr_min}
              onChange={e => update(i, 'hr_min', e.target.value)}
              placeholder="111"
              inputMode="numeric"
              className={`${INPUT} text-center`}
            />
            <span className="font-mono text-[11px] text-stone text-center">to</span>
            <input
              value={z.hr_max}
              onChange={e => update(i, 'hr_max', e.target.value)}
              placeholder="140"
              inputMode="numeric"
              className={`${INPUT} text-center`}
            />
            <button
              type="button"
              onClick={() => removeZone(i)}
              aria-label={`Remove zone ${i + 1}`}
              className="font-mono text-[16px] text-stone/50 hover:text-oxblood transition-colors leading-none"
            >
              ×
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={addZone}
          className="self-start font-mono text-[12px] text-marine hover:text-marine-dark transition-colors mt-1"
        >
          + Add zone
        </button>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="bg-oxblood text-bone text-[13px] font-medium px-4 py-[8px] rounded-[8px] hover:bg-oxblood-dark transition-colors disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save zones'}
        </button>
        {saved && !pending && (
          <span className="font-mono text-[11px] text-fern">Saved</span>
        )}
      </div>
    </div>
  );
}
