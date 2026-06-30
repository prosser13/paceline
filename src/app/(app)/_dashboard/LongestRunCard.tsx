import { loadWeeklyPlanSeries } from './data';
import { RUN, RACE } from '@/lib/colors';

const BUILD = '#b07d12';

// Longest run / week trend card — the longest planned run each plan week, run-red
// bars with the race week in race-red, current week outlined. Matches the mockup.
export default async function LongestRunCard({ raceName }: { raceName: string | null }) {
  const series = await loadWeeklyPlanSeries();
  if (series.length < 2 || series.every(s => s.longestRunKm === 0)) return null;
  const max = Math.max(...series.map(s => s.longestRunKm), 1);

  return (
    <div className="border border-fog rounded-[16px] bg-paper" style={{ padding: '16px 18px' }}>
      <div className="flex items-center justify-between">
        <span className="font-display font-bold text-[16px]">Longest run / week</span>
        <span className="text-[12px] font-bold" style={{ color: RUN }}>{raceName ? `→ ${raceName}` : 'km'}</span>
      </div>
      <div className="flex items-end gap-[8px] mt-[12px]" style={{ height: '60px' }}>
        {series.map(w => {
          const h = w.longestRunKm <= 0 ? 4 : Math.max(8, Math.round((w.longestRunKm / max) * 54));
          const color = w.isRace ? RACE : RUN;
          return (
            <div key={w.weekNumber} className="flex-1 rounded-[3px]"
              style={{ height: `${h}px`, background: color, ...(w.isCurrent ? { outline: `2px solid ${color}`, outlineOffset: '1px' } : {}) }} />
          );
        })}
      </div>
      <div className="flex gap-[8px] mt-[5px]">
        {series.map(w => (
          <span key={w.weekNumber} className="flex-1 text-center text-[9px] font-semibold"
            style={{ color: w.isRace ? RACE : w.isCurrent ? BUILD : 'var(--color-ink)' }}>
            {Math.round(w.longestRunKm)}{w.isCurrent ? '·now' : ''}
          </span>
        ))}
      </div>
      <div className="text-[12px] font-semibold mt-[6px]">
        Longest run builds, then tapers into the <span style={{ color: RACE }}>race</span>.
      </div>
    </div>
  );
}
