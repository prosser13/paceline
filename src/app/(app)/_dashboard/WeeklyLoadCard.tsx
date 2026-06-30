import { loadWeeklyPlanSeries } from './data';
import { PHASE_COLOR } from '@/lib/colors';

const BUILD = '#b07d12';

// Weekly load (planned TSS per plan week) trend card — phase-coloured bars across
// the plan, current week outlined. Planned trajectory; matches the mockup.
export default async function WeeklyLoadCard({ raceName }: { raceName: string | null }) {
  const series = await loadWeeklyPlanSeries();
  if (series.length < 2) return null;
  const max = Math.max(...series.flatMap(s => [s.plannedTss, s.doneTss]), 1);
  const current = series.find(s => s.isCurrent);

  return (
    <div className="border border-fog rounded-[16px] bg-paper" style={{ padding: '16px 18px' }}>
      <div className="flex items-center justify-between">
        <span className="font-display font-bold text-[16px]">Weekly load</span>
        <span className="text-[12px] font-bold" style={{ color: BUILD }}>TSS{raceName ? ` → ${raceName}` : ''}</span>
      </div>
      <div className="flex items-end gap-[8px] mt-[10px]" style={{ height: '58px' }}>
        {series.map(w => {
          const color = PHASE_COLOR[w.phase] ?? '#8a857a';
          const ph = Math.max(4, Math.round((w.plannedTss / max) * 52));        // planned (faint)
          const dh = w.doneTss > 0 ? Math.max(4, Math.round((w.doneTss / max) * 52)) : 0; // done (solid)
          return (
            <div key={w.weekNumber} className="relative flex-1 rounded-[3px]" style={{ height: '58px', ...(w.isCurrent ? { outline: `2px solid ${color}`, outlineOffset: '1px' } : {}) }}>
              <div className="absolute bottom-0 left-0 right-0 rounded-[3px]" style={{ height: `${ph}px`, background: color, opacity: 0.28 }} />
              {dh > 0 && <div className="absolute bottom-0 left-0 right-0 rounded-[3px]" style={{ height: `${dh}px`, background: color }} />}
            </div>
          );
        })}
      </div>
      <div className="flex gap-[8px] mt-[5px]">
        {series.map(w => (
          <span key={w.weekNumber} className="flex-1 text-center text-[9px] font-semibold"
            style={{ color: w.isCurrent ? BUILD : w.isRace ? 'var(--color-race)' : 'var(--color-ink)' }}>
            {w.isCurrent ? `${w.weekNumber}·now` : w.isRace ? `${w.weekNumber}·race` : w.weekNumber === 1 ? 'W1' : w.weekNumber}
          </span>
        ))}
      </div>
      <div className="text-[12px] font-semibold mt-[6px]">
        Solid = done · faint = planned.{current ? ` ${current.doneTss}/${current.plannedTss} TSS this week.` : ''}
      </div>
    </div>
  );
}
