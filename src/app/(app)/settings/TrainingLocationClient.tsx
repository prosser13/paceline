'use client';

import { useState, useTransition } from 'react';
import { saveTrainingLocation, setTravelLocation, clearTravelLocation } from './actions';

const INPUT =
  'bg-bone border border-fog rounded-[6px] px-2 py-[5px] font-mono text-[13px] text-ink focus:outline-none focus:border-stone transition-colors';

interface Props {
  initialHomeLabel: string | null;
  initialDefaultHour: number;
  initialOverrideLabel: string | null;
}

function hourLabel(h: number): string {
  const ap = h < 12 ? 'am' : 'pm';
  return `${h % 12 === 0 ? 12 : h % 12}:00${ap}`;
}

export default function TrainingLocationClient({ initialHomeLabel, initialDefaultHour, initialOverrideLabel }: Props) {
  const [place, setPlace] = useState(initialHomeLabel ?? '');
  const [hour, setHour] = useState(String(initialDefaultHour));
  const [homeLabel, setHomeLabel] = useState(initialHomeLabel);
  const [travel, setTravel] = useState('');
  const [awayLabel, setAwayLabel] = useState(initialOverrideLabel);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const saveHome = () => start(async () => {
    setMsg(null);
    const r = await saveTrainingLocation({ place, defaultHour: hour });
    if (r.ok) { setHomeLabel(r.label ?? place); setMsg('Saved'); } else setMsg(r.error ?? 'Failed');
  });
  const setAway = () => start(async () => {
    setMsg(null);
    const r = await setTravelLocation(travel);
    if (r.ok) { setAwayLabel(r.label ?? travel); setTravel(''); setMsg('Away location set'); } else setMsg(r.error ?? 'Failed');
  });
  const backHome = () => start(async () => { await clearTravelLocation(); setAwayLabel(null); setMsg('Back home'); });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-stone">
        Daily heat-adjusted paces on the dashboard use your <b>home</b> location; set a temporary override when you’re away.
      </p>

      {/* Home */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[11px] uppercase tracking-[.08em] text-stone">Home town / city</label>
          <input value={place} onChange={e => { setPlace(e.target.value); setMsg(null); }}
                 placeholder="e.g. Bristol" className={`${INPUT} w-[200px]`} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[11px] uppercase tracking-[.08em] text-stone">Usual run time</label>
          <select value={hour} onChange={e => { setHour(e.target.value); setMsg(null); }} className={`${INPUT} w-[110px]`}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
        </div>
        <button type="button" onClick={saveHome} disabled={pending || !place.trim()}
          className="bg-oxblood text-bone text-[13px] font-medium px-4 py-[8px] rounded-[8px] hover:bg-oxblood-dark transition-colors disabled:opacity-50">
          {pending ? 'Saving…' : 'Save location'}
        </button>
      </div>
      {homeLabel && <div className="text-[12px] text-stone -mt-1">Home: <b className="text-ink">{homeLabel}</b></div>}

      {/* Travel override */}
      <div className="border-t border-fog pt-4 flex flex-wrap items-end gap-3">
        {awayLabel ? (
          <>
            <div className="text-[13px]">Away in <b>{awayLabel}</b> — heat-adjusted paces use this until you’re back.</div>
            <button type="button" onClick={backHome} disabled={pending}
              className="text-[13px] font-medium px-3 py-[7px] rounded-[8px] border border-fog text-ink hover:bg-fog/40 transition-colors disabled:opacity-50">
              Back home
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[11px] uppercase tracking-[.08em] text-stone">Away right now?</label>
              <input value={travel} onChange={e => { setTravel(e.target.value); setMsg(null); }}
                     placeholder="Where are you?" className={`${INPUT} w-[200px]`} />
            </div>
            <button type="button" onClick={setAway} disabled={pending || !travel.trim()}
              className="text-[13px] font-medium px-3 py-[7px] rounded-[8px] border border-fog text-ink hover:bg-fog/40 transition-colors disabled:opacity-50">
              Override — I’m away
            </button>
          </>
        )}
      </div>

      {msg && <span className="font-mono text-[11px] text-fern">{msg}</span>}
    </div>
  );
}
