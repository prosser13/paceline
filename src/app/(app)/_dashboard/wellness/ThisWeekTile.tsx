// This week — 7-day averages (sleep, HRV, resting HR, steps) with a delta vs the
// week before. Compact 2×2, sized to sit under Standouts and balance the column.
import type { WeeklyRecap } from '@/lib/wellness-stats';
import { Tile, FLAG_COLOR } from './shared';

export function ThisWeekTile({ recap }: { recap: WeeklyRecap }) {
  return (
    <Tile title="This week" kicker="vs last">
      <div className="grid grid-cols-2 gap-[10px]">
        {recap.stats.map(s => (
          <div key={s.key} className="border border-fog rounded-[12px]" style={{ padding: '10px 12px' }}>
            <div className="text-[10px] uppercase font-bold text-stone" style={{ letterSpacing: '.05em' }}>{s.label}</div>
            <div className="font-display font-bold text-[20px] tabular-nums leading-none" style={{ marginTop: 3 }}>{s.value}</div>
            <div className="text-[11px] font-bold tabular-nums" style={{ marginTop: 3, color: FLAG_COLOR[s.tone] }}>
              {s.delta ?? '—'}
            </div>
          </div>
        ))}
      </div>
    </Tile>
  );
}
