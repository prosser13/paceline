'use client';

import { useState, useTransition } from 'react';
import { savePaceZones, correctThresholdAction, type ZoneInput } from './actions';
import ThresholdSuggestion from '../benchmarks/ThresholdSuggestion';
import type { ThresholdCheck } from '@/data/threshold-suggestion';

interface Props {
  initialThreshold: string;
  initialZones: ZoneInput[];
  thresholdCheck?: { latest: ThresholdCheck | null; pending: ThresholdCheck | null; history: ThresholdCheck[] };
}

const INPUT =
  'bg-bone border border-fog rounded-[6px] px-2 py-[5px] font-mono text-[13px] text-ink focus:outline-none focus:border-stone transition-colors';

// Stable row identity so add/remove doesn't reuse inputs by index.
type ZoneRow = ZoneInput & { _key: number };
let nextKey = 0;
const withKey = (z: ZoneInput): ZoneRow => ({ ...z, _key: nextKey++ });

export default function ZonesClient({ initialThreshold, initialZones, thresholdCheck }: Props) {
  const [threshold, setThreshold] = useState(initialThreshold);
  const [zones, setZones]         = useState<ZoneRow[]>(
    (initialZones.length ? initialZones : [{ name: '', pace_min: '', pace_max: '' }]).map(withKey),
  );
  const [saved, setSaved]   = useState(false);
  const [pending, start]    = useTransition();

  // One-time re-base ("the setting was wrong") — shifts threshold + all zones
  // together, bypassing the progression ratchet.
  const [correctOpen, setCorrectOpen] = useState(false);
  const [correctPace, setCorrectPace] = useState('');
  const [correctReason, setCorrectReason] = useState('');
  const [correctMsg, setCorrectMsg] = useState<string | null>(null);
  const [correcting, startCorrect] = useTransition();
  function runCorrection() {
    startCorrect(async () => {
      setCorrectMsg(null);
      const r = await correctThresholdAction(correctPace, correctReason);
      if (r.ok) { setThreshold(correctPace.trim()); setCorrectMsg('Re-based — threshold + zones shifted, TSS recomputed.'); setCorrectOpen(false); }
      else setCorrectMsg(r.error ?? 'Failed');
    });
  }

  function update(i: number, field: keyof ZoneInput, value: string) {
    setZones(zs => zs.map((z, idx) => (idx === i ? { ...z, [field]: value } : z)));
    setSaved(false);
  }

  function addZone() {
    setZones(zs => [...zs, withKey({ name: '', pace_min: '', pace_max: '' })]);
    setSaved(false);
  }

  function removeZone(i: number) {
    setZones(zs => zs.filter((_, idx) => idx !== i));
    setSaved(false);
  }

  function save() {
    start(async () => {
      await savePaceZones(threshold, zones.map(z => ({ name: z.name, pace_min: z.pace_min, pace_max: z.pace_max })));
      setSaved(true);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Threshold */}
      <div className="flex items-center gap-3">
        <label className="font-mono text-[11px] uppercase tracking-[.1em] text-stone w-[120px] shrink-0">
          Threshold
        </label>
        <input
          value={threshold}
          onChange={e => { setThreshold(e.target.value); setSaved(false); }}
          placeholder="3:40"
          className={`${INPUT} w-[80px] text-center`}
        />
        <span className="font-mono text-[11px] text-stone">/km</span>
      </div>

      {/* Auto-suggestion — commentary + Apply/Dismiss, mirrored from Benchmarks */}
      {thresholdCheck && (
        <ThresholdSuggestion latest={thresholdCheck.latest} pending={thresholdCheck.pending} history={thresholdCheck.history} />
      )}

      {/* One-time re-base */}
      <div>
        <button type="button" onClick={() => setCorrectOpen(o => !o)} className="font-mono text-[11.5px] text-stone hover:text-ink underline">
          {correctOpen ? 'Cancel re-base' : 'Threshold was wrong? Re-base it'}
        </button>
        {correctOpen && (
          <div className="flex flex-col gap-2 border border-fog rounded-[10px] bg-bone mt-2" style={{ padding: '10px 12px' }}>
            <p className="text-[12px] text-stone">A deliberate correction — shifts threshold and every pace zone together, recomputes TSS, and logs the reason. Bypasses the progression cap.</p>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="font-mono text-[11px] uppercase tracking-[.08em] text-stone">New threshold</label>
              <input value={correctPace} onChange={e => { setCorrectPace(e.target.value); setCorrectMsg(null); }} placeholder="3:35" className={`${INPUT} w-[72px] text-center`} />
              <span className="font-mono text-[11px] text-stone">/km</span>
            </div>
            <input value={correctReason} onChange={e => { setCorrectReason(e.target.value); setCorrectMsg(null); }} placeholder="Reason (e.g. original figure was outdated)" className={`${INPUT} w-full font-sans`} />
            <div className="flex items-center gap-3">
              <button type="button" onClick={runCorrection} disabled={correcting || !correctPace.trim() || !correctReason.trim()}
                className="bg-oxblood text-bone text-[12.5px] font-medium px-3 py-[7px] rounded-[8px] disabled:opacity-50">
                {correcting ? 'Applying…' : 'Re-base threshold'}
              </button>
              {correctMsg && <span className="font-mono text-[11px] text-stone">{correctMsg}</span>}
            </div>
          </div>
        )}
      </div>
      {correctMsg && !correctOpen && <span className="font-mono text-[11px] text-fern -mt-3">{correctMsg}</span>}

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
              value={z.pace_min}
              onChange={e => update(i, 'pace_min', e.target.value)}
              placeholder="4:15"
              className={`${INPUT} text-center`}
            />
            <span className="font-mono text-[11px] text-stone text-center">to</span>
            <input
              value={z.pace_max}
              onChange={e => update(i, 'pace_max', e.target.value)}
              placeholder="4:59"
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
          <span className="font-mono text-[11px] text-fern">Saved · paces updated across the plan</span>
        )}
      </div>
    </div>
  );
}
