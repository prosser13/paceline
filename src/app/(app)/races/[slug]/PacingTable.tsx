// Checkpoint pacing schedule — target arrivals, leg pace and per-leg ascent
// derived from the target finish time (see data/races/pacing.ts).

import type { PacingRow } from '@/data/races/pacing';

export default function PacingTable({
  rows, targetTime, note,
}: {
  rows: PacingRow[];
  targetTime: string;
  note?: string | null;
}) {
  return (
    <div className="border border-fog rounded-[14px] bg-paper overflow-hidden">
      <div className="flex items-baseline justify-between gap-3" style={{ padding: '14px 16px 8px' }}>
        <span className="font-display font-bold text-[16px]">Pacing plan</span>
        <span className="text-[12px] font-bold text-stone">Target {targetTime}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-stone font-mono text-[10px] uppercase tracking-[.08em]">
              <th className="text-left font-normal px-[16px] py-[7px]">Checkpoint</th>
              <th className="text-right font-normal px-[10px] py-[7px]">Km</th>
              <th className="text-right font-normal px-[10px] py-[7px]">Leg /km</th>
              <th className="text-right font-normal px-[10px] py-[7px]">Climb</th>
              <th className="text-right font-normal px-[10px] py-[7px]">Elapsed</th>
              <th className="text-right font-normal px-[16px] py-[7px]">Arrive</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-fog/70">
                <td className="px-[16px] py-[8px] text-ink font-semibold">
                  {r.name}
                  {r.dropBag && (
                    <span className="ml-[7px] font-mono text-[9px] uppercase tracking-[.06em] text-marine border border-marine/40 rounded-[3px] px-[4px] py-[1px]">
                      drop
                    </span>
                  )}
                </td>
                <td className="px-[10px] py-[8px] text-right font-mono text-stone tabular-nums">{r.distanceKm}</td>
                <td className="px-[10px] py-[8px] text-right font-mono text-stone tabular-nums">{r.legPace ?? '—'}</td>
                <td className="px-[10px] py-[8px] text-right font-mono text-stone tabular-nums">
                  {r.legClimbM > 0 ? `+${r.legClimbM} m` : <span className="text-stone/50">—</span>}
                </td>
                <td className="px-[10px] py-[8px] text-right font-mono text-ink tabular-nums">{r.cumElapsed}</td>
                <td className="px-[16px] py-[8px] text-right font-mono text-ink tabular-nums">{r.arrival}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-[16px] py-[9px] border-t border-fog text-[10px] text-stone">
        {note ?? 'Splits distributed by climb-weighted effort, not flat pace.'}
      </p>
    </div>
  );
}
