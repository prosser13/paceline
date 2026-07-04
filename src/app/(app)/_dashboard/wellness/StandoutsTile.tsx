// Standouts — notable recent numbers, positive-leaning. Final design: A's ranked
// list with B's coloured highlight (each row filled with its tone tint).
import type { Standout } from '@/lib/wellness-stats';
import { Tile, FLAG_COLOR, FLAG_SOFT } from './shared';

const GLYPH: Record<Standout['icon'], string> = { up: '▴', down: '▾', star: '✦' };

export function StandoutsTile({ items }: { items: Standout[] }) {
  return (
    <Tile title="Standouts" kicker="last 2 weeks">
      {items.length === 0 ? (
        <p className="text-[13px] text-stone">Steady week — nothing out of the ordinary.</p>
      ) : (
        <div className="flex flex-col gap-[8px]">
          {items.map(it => (
            <div key={it.key} className="flex items-center gap-[11px] rounded-[10px]"
              style={{ padding: '9px 11px', background: FLAG_SOFT[it.tone] }}>
              <span className="grid place-items-center rounded-[7px] text-[12px] shrink-0"
                style={{ width: 24, height: 24, background: FLAG_COLOR[it.tone], color: '#fff' }}>{GLYPH[it.icon]}</span>
              <span className="text-[13px] leading-[1.3]">{it.text}</span>
              <span className="ml-auto font-display font-bold text-[17px] tabular-nums shrink-0" style={{ color: FLAG_COLOR[it.tone] }}>{it.value}</span>
            </div>
          ))}
        </div>
      )}
    </Tile>
  );
}
