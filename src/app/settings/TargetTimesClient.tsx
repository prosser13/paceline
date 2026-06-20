'use client';

import { useState, useTransition } from 'react';
import { saveTargetTime } from './actions';
import { secondsToPace } from '@/lib/plan-structure';

export interface TargetTimeRow {
  id: number;
  name: string;
  distance_km: number;
  target_time: string | null;
}

const INPUT =
  'bg-bone border border-fog rounded-[6px] px-2 py-[5px] font-mono text-[13px] text-ink focus:outline-none focus:border-stone transition-colors';

// "h:mm:ss" / "h:mm" + distance → derived "m:ss"/km, live as the user types.
function derivePace(time: string, distanceKm: number): string | null {
  const parts = time.trim().split(':').map(Number);
  if (!parts.length || parts.some(isNaN)) return null;
  let secs: number | null = null;
  if (parts.length === 3) secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
  else if (parts.length === 2) secs = parts[0] * 3600 + parts[1] * 60;
  if (secs == null || distanceKm <= 0) return null;
  return secondsToPace(Math.round(secs / distanceKm));
}

export default function TargetTimesClient({ plans }: { plans: TargetTimeRow[] }) {
  const [times, setTimes] = useState<Record<number, string>>(
    Object.fromEntries(plans.map(p => [p.id, p.target_time ?? ''])),
  );
  const [savedId, setSavedId] = useState<number | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [, start] = useTransition();

  function save(id: number) {
    setPendingId(id);
    start(async () => {
      await saveTargetTime(id, times[id] ?? '');
      setPendingId(null);
      setSavedId(id);
      setTimeout(() => setSavedId(s => (s === id ? null : s)), 2500);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="grid items-center gap-3 font-mono text-[9.5px] uppercase tracking-[.1em] text-stone/70"
        style={{ gridTemplateColumns: '1fr 110px 92px 92px' }}
      >
        <span>Race</span>
        <span>Target time</span>
        <span className="text-right">Pace</span>
        <span />
      </div>

      {plans.map(p => {
        const time = times[p.id] ?? '';
        const pace = derivePace(time, p.distance_km);
        return (
          <div
            key={p.id}
            className="grid items-center gap-3"
            style={{ gridTemplateColumns: '1fr 110px 92px 92px' }}
          >
            <div className="min-w-0">
              <div className="text-[15px] text-ink truncate">{p.name}</div>
              <div className="font-mono text-[11px] text-stone">{p.distance_km} km</div>
            </div>
            <input
              value={time}
              onChange={e => setTimes(t => ({ ...t, [p.id]: e.target.value }))}
              placeholder="h:mm:ss"
              className={`${INPUT} w-full text-center`}
            />
            <span className="font-mono text-[13px] text-stone text-right tabular-nums">
              {pace ? `${pace}/km` : '—'}
            </span>
            <button
              type="button"
              onClick={() => save(p.id)}
              disabled={pendingId === p.id}
              className="bg-oxblood text-bone text-[13px] font-medium px-3 py-[7px] rounded-[8px] hover:bg-oxblood-dark transition-colors disabled:opacity-50"
            >
              {pendingId === p.id ? 'Saving…' : savedId === p.id ? 'Saved' : 'Save'}
            </button>
          </div>
        );
      })}

      <p className="font-mono text-[11px] text-stone/70 mt-1 leading-relaxed">
        Updating a target time recalculates its pace and updates the goal-pace segments in that
        plan&apos;s linked training runs. Race-day pacing strategies are left untouched.
      </p>
    </div>
  );
}
