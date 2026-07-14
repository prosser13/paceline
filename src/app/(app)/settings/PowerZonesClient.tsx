'use client';

import { useState, useTransition } from 'react';
import { savePowerZones, type PowerZoneInput } from './actions';

interface Props {
  initialThreshold: string;
  initialZones: PowerZoneInput[];
}

const INPUT =
  'bg-bone border border-fog rounded-[6px] px-2 py-[5px] font-mono text-[13px] text-ink focus:outline-none focus:border-stone transition-colors';

// Stable row identity so add/remove doesn't reuse inputs by index.
type PowerZoneRow = PowerZoneInput & { _key: number };
let nextKey = 0;
const withKey = (z: PowerZoneInput): PowerZoneRow => ({ ...z, _key: nextKey++ });

// Standard Coggan power zones from FTP (watts). A 20-min all-out test gives FTP ≈
// 95% of the 20-min average; zones are then fixed fractions of FTP.
const COGGAN: Array<{ name: string; lo: number; hi: number }> = [
  { name: 'Recovery',          lo: 0,    hi: 0.55 },
  { name: 'Aerobic Endurance', lo: 0.56, hi: 0.75 },
  { name: 'Tempo',             lo: 0.76, hi: 0.90 },
  { name: 'Threshold',         lo: 0.91, hi: 1.05 },
  { name: 'Anaerobic',         lo: 1.06, hi: 1.50 },
];
function zonesFromFtp(ftp: number): PowerZoneRow[] {
  return COGGAN.map(z => withKey({
    name: z.name,
    power_min: String(Math.round(ftp * z.lo)),
    power_max: String(Math.round(ftp * z.hi)),
  }));
}

export default function PowerZonesClient({ initialThreshold, initialZones }: Props) {
  const [threshold, setThreshold] = useState(initialThreshold);
  const [zones, setZones]         = useState<PowerZoneRow[]>(
    (initialZones.length ? initialZones : [{ name: '', power_min: '', power_max: '' }]).map(withKey),
  );
  const [testWatts, setTestWatts] = useState('');
  const [saved, setSaved] = useState(false);
  const [pending, start]  = useTransition();

  // Fill FTP + the full zone set from a 20-min test (FTP = 95% of the 20-min avg).
  // Populates the fields; the athlete reviews and clicks Save.
  function fillFromTest() {
    const w = Number(testWatts);
    if (!Number.isFinite(w) || w <= 0) return;
    const ftp = Math.round(w * 0.95);
    setThreshold(String(ftp));
    setZones(zonesFromFtp(ftp));
    setSaved(false);
  }

  function update(i: number, field: keyof PowerZoneInput, value: string) {
    setZones(zs => zs.map((z, idx) => (idx === i ? { ...z, [field]: value } : z)));
    setSaved(false);
  }

  function addZone() {
    setZones(zs => [...zs, withKey({ name: '', power_min: '', power_max: '' })]);
    setSaved(false);
  }

  function removeZone(i: number) {
    setZones(zs => zs.filter((_, idx) => idx !== i));
    setSaved(false);
  }

  function save() {
    start(async () => {
      await savePowerZones(threshold, zones.map(z => ({ name: z.name, power_min: z.power_min, power_max: z.power_max })));
      setSaved(true);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* FTP from a 20-min test → fills the threshold + zones below (review, then Save). */}
      <div className="flex flex-wrap items-center gap-3 rounded-[8px] border border-fog bg-bone/40 px-3 py-[10px]">
        <label className="font-mono text-[11px] uppercase tracking-[.08em] text-stone shrink-0">20-min test</label>
        <input
          value={testWatts}
          onChange={e => setTestWatts(e.target.value)}
          placeholder="e.g. 300"
          inputMode="numeric"
          className={`${INPUT} w-[80px] text-center`}
        />
        <span className="font-mono text-[11px] text-stone">W avg</span>
        <button type="button" onClick={fillFromTest}
          className="font-mono text-[12px] text-marine hover:text-marine-dark transition-colors">
          → Set FTP + zones (95%)
        </button>
      </div>

      {/* Threshold power (FTP) */}
      <div className="flex items-center gap-3">
        <label className="font-mono text-[11px] uppercase tracking-[.08em] text-stone w-[120px] shrink-0">
          Threshold power
        </label>
        <input
          value={threshold}
          onChange={e => { setThreshold(e.target.value); setSaved(false); }}
          placeholder="270"
          inputMode="numeric"
          className={`${INPUT} w-[80px] text-center`}
        />
        <span className="font-mono text-[11px] text-stone">W</span>
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
          <div key={z._key} className="grid items-center gap-2"
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
              value={z.power_min}
              onChange={e => update(i, 'power_min', e.target.value)}
              placeholder="149"
              inputMode="numeric"
              className={`${INPUT} text-center`}
            />
            <span className="font-mono text-[11px] text-stone text-center">to</span>
            <input
              value={z.power_max}
              onChange={e => update(i, 'power_max', e.target.value)}
              placeholder="202"
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
          <span className="font-mono text-[11px] text-fern">Saved · power targets updated across rides</span>
        )}
      </div>
    </div>
  );
}
