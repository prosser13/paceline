// Standouts — notable recent numbers, positive-leaning. Final design: A's ranked
// list with B's coloured highlight (each row filled with its tone tint).
import type { Standout } from '@/lib/wellness-stats';
import { Tile, FLAG_COLOR, FLAG_SOFT } from './shared';

const GLYPH: Record<Standout['icon'], string> = { up: '▴', down: '▾', star: '✦', flame: '✦', trophy: '★', run: '▴' };

export function StandoutsTile({ items }: { items: Standout[] }) {
  return (
    <Tile title="Standouts" kicker="last 3 days">
      {items.length === 0 ? (
        <p className="text-[13px] text-stone">Nothing standout in the last few days — steady as she goes.</p>
      ) : (
        <div className="flex flex-col gap-[8px]">
          {items.map(it => (
            <div key={it.key} className="flex items-center gap-[11px] rounded-[10px]"
              style={{ padding: '9px 11px', background: FLAG_SOFT[it.tone] }}>
              <span className="grid place-items-center rounded-[7px] text-[12px] shrink-0"
                style={{ width: 24, height: 24, background: FLAG_COLOR[it.tone], color: '#fff' }}>{GLYPH[it.icon]}</span>
              <span className="min-w-0">
                <span className="block text-[13px] leading-[1.25]">{it.text}</span>
                {it.when && it.when !== 'now' && <span className="block text-[10.5px] text-stone" style={{ marginTop: 1 }}>{it.when}</span>}
              </span>
              <span className="ml-auto font-display font-bold text-[17px] tabular-nums shrink-0" style={{ color: FLAG_COLOR[it.tone] }}>{it.value}</span>
            </div>
          ))}
        </div>
      )}
    </Tile>
  );
}
