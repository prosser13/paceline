// Checkpoint pacing schedule — target arrivals, leg pace and cut-off margins
// derived from the target finish time (see data/races/pacing.ts).

import { CardHeader, cardClass } from '@/components/dashboard-graphics';
import { OXBLOOD } from '@/lib/colors';
import type { PacingRow } from '@/data/races/pacing';

function marginLabel(min: number): string {
  const a = Math.abs(min);
  const h = Math.floor(a / 60);
  const m = a % 60;
  const body = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return min < 0 ? `-${body}` : `+${body}`;
}

export default function PacingTable({ rows, targetTime }: { rows: PacingRow[]; targetTime: string }) {
  return (
    <div className={cardClass}>
      <CardHeader accent={OXBLOOD} right={`Target ${targetTime}`}>Pacing plan</CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-stone font-mono text-[10px] uppercase tracking-[.08em]">
              <th className="text-left font-normal px-[16px] py-[9px]">Checkpoint</th>
              <th className="text-right font-normal px-[10px] py-[9px]">Mile</th>
              <th className="text-right font-normal px-[10px] py-[9px]">Elapsed</th>
              <th className="text-right font-normal px-[10px] py-[9px]">Arrive</th>
              <th className="text-right font-normal px-[10px] py-[9px]">Leg /km</th>
              <th className="text-right font-normal px-[16px] py-[9px]">Cut-off</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-fog/70">
                <td className="px-[16px] py-[9px] text-ink">
                  {r.name}
                  {r.dropBag && (
                    <span className="ml-[7px] font-mono text-[9px] uppercase tracking-[.06em] text-marine border border-marine/40 rounded-[3px] px-[4px] py-[1px]">
                      drop bag
                    </span>
                  )}
                </td>
                <td className="px-[10px] py-[9px] text-right font-mono text-stone">{r.distanceMi}</td>
                <td className="px-[10px] py-[9px] text-right font-mono text-ink">{r.cumElapsed}</td>
                <td className="px-[10px] py-[9px] text-right font-mono text-ink">{r.arrival}</td>
                <td className="px-[10px] py-[9px] text-right font-mono text-stone">{r.legPace ?? '—'}</td>
                <td className="px-[16px] py-[9px] text-right font-mono">
                  {r.cutoff ? (
                    <span>
                      {r.cutoff}
                      {r.marginMin != null && (
                        <span className={`ml-[6px] text-[11px] ${r.marginMin < 30 ? 'text-oxblood' : 'text-fern'}`}>
                          {marginLabel(r.marginMin)}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-stone/50">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-[16px] py-[9px] border-t border-fog font-mono text-[10px] text-stone">
        Times distributed by climb-weighted effort, not flat pace. Margin = time in hand vs the cut-off;
        red means under 30 min.
      </p>
    </div>
  );
}
