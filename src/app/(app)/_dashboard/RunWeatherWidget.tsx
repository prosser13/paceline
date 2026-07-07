'use client';

// Heat-adjusted pace preview for today's run (PB-campaign wave 4). Pick a start
// hour (past hours hidden) to see the conditions and the pace the heat makes an
// honest effort read — the plan target itself never changes. Preview only; picking
// a time doesn't schedule the run.

import { useState } from 'react';
import { heatPenalty, type RunHourCondition } from '@/lib/weather';

function secToPace(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function hourLabel(h: number): string {
  const ap = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00${ap}`;
}

export default function RunWeatherWidget({
  hours, defaultHour, planPaceLabel, planPaceSec, planPaceEndLabel, locationLabel, away,
}: {
  hours: RunHourCondition[];
  defaultHour: number;
  planPaceLabel: string;
  planPaceSec: number;
  planPaceEndLabel?: string | null;
  locationLabel: string | null;
  away: boolean;
}) {
  // Hide past hours (today). new Date() on the client → the athlete's local hour,
  // which for a London-based athlete matches the forecast's Europe/London hours.
  const nowHour = new Date().getHours();
  const options = hours.filter(h => h.hour >= nowHour);
  const usable = options.length ? options : hours.slice(-1);   // late-evening fallback
  const initial = usable.find(h => h.hour === defaultHour) ?? usable[0];
  const [hour, setHour] = useState<number>(initial.hour);

  const cond = usable.find(h => h.hour === hour) ?? usable[0];
  const pen = heatPenalty(cond.tempC, cond.dewC, planPaceSec);
  const applies = pen.secPerKm >= 3;
  const adjusted = planPaceSec + pen.secPerKm;

  return (
    <div className="border border-fog rounded-[16px] bg-paper mb-[18px]" style={{ padding: '14px 18px' }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[11px] uppercase font-bold text-hard" style={{ letterSpacing: '.06em' }}>Heat-adjusted pace</div>
        <div className="flex items-center gap-2 text-[12px] text-stone">
          {locationLabel && <span>{locationLabel}</span>}
          {away && <span className="text-[10px] uppercase font-bold rounded-full px-2 py-[2px]" style={{ background: 'var(--color-strength-soft)', color: 'var(--color-strength)' }}>away</span>}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: '12px' }}>
        <label className="text-[11px] uppercase text-stone tracking-[.04em]">Conditions at</label>
        <select value={hour} onChange={e => setHour(Number(e.target.value))}
          className="bg-bone border border-fog rounded-[8px] px-[9px] py-[5px] text-[12.5px] text-ink font-mono focus:outline-none focus:border-stone">
          {usable.map(h => <option key={h.hour} value={h.hour}>{hourLabel(h.hour)}</option>)}
        </select>
        <span className="inline-flex items-center gap-[6px] text-[12px] font-semibold border border-fog rounded-[8px] bg-bone text-stone" style={{ padding: '4px 9px' }}>
          🌡 {cond.tempC}°C · dew {cond.dewC}°C
        </span>
        {applies && (
          <span className="inline-flex items-center text-[12px] font-bold rounded-[8px]" style={{ padding: '4px 9px', background: 'var(--color-strength-soft)', color: 'var(--color-hard)' }}>
            +{pen.secPerKm}s/km
          </span>
        )}
      </div>

      {applies ? (
        <div className="flex items-center gap-[16px] flex-wrap" style={{ marginTop: '12px' }}>
          <div>
            <div className="text-[11px] text-stone">Plan pace</div>
            <div className="font-display font-bold text-[19px]">{planPaceLabel}{planPaceEndLabel ? `–${planPaceEndLabel}` : ''}/km</div>
          </div>
          <div className="text-stone self-end pb-[3px]">→</div>
          <div>
            <div className="text-[11px]" style={{ color: 'var(--color-hard)' }}>Today, adjusted</div>
            <div className="font-display font-bold text-[19px]" style={{ color: 'var(--color-hard)' }}>{secToPace(adjusted)}/km</div>
          </div>
        </div>
      ) : (
        <div className="text-[12.5px] text-stone" style={{ marginTop: '10px' }}>Cool enough — run the plan target ({planPaceLabel}{planPaceEndLabel ? `–${planPaceEndLabel}` : ''}/km) honestly.</div>
      )}

      <div className="text-[11px] text-stone italic" style={{ marginTop: '10px' }}>
        Past hours are hidden. Picking a time only previews conditions — it won’t schedule your run.
        {applies && ' The plan target is unchanged; heat just makes the honest effort read slower.'}
      </div>
    </div>
  );
}
