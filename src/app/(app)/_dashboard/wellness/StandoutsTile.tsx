// Standouts — notable recent numbers, positive-leaning. Variants A / B / C.
import type { Standout } from '@/lib/wellness-stats';
import { Tile, FLAG_COLOR, FLAG_SOFT } from './shared';

const GLYPH: Record<Standout['icon'], string> = { up: '▴', down: '▾', star: '✦' };

function Empty() {
  return <p className="text-[13px] text-stone">Steady week — nothing out of the ordinary.</p>;
}

export function StandoutsTile({ items, variant }: { items: Standout[]; variant: 'A' | 'B' | 'C' }) {
  if (variant === 'B') {
    const [hero, ...rest] = items;
    return (
      <Tile title="Standouts" kicker="last 2 weeks">
        {!hero ? <Empty /> : (
          <>
            <div className="flex items-center gap-[12px] rounded-[12px]" style={{ padding: '13px 14px', background: FLAG_SOFT[hero.tone] }}>
              <span className="font-display tabular-nums" style={{ fontSize: 26, color: FLAG_COLOR[hero.tone] }}>{hero.value}</span>
              <span className="text-[12.5px] leading-[1.35]">{hero.text}</span>
            </div>
            {rest.length > 0 && (
              <div className="flex flex-wrap gap-[7px]" style={{ marginTop: 12 }}>
                {rest.map(r => (
                  <span key={r.key} className="text-[12px] border border-fog rounded-full flex items-center gap-[7px]" style={{ padding: '5px 11px' }}>
                    {r.text}<b className="font-display tabular-nums">{r.value}</b>
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </Tile>
    );
  }

  if (variant === 'C') {
    return (
      <Tile title="Standouts" kicker="notable this fortnight">
        {items.length === 0 ? <Empty /> : (
          <div className="grid grid-cols-2 gap-[10px]">
            {items.map(it => (
              <div key={it.key} className="border border-fog rounded-[12px]" style={{ padding: '11px 12px' }}>
                <div className="text-[16px] font-display tabular-nums" style={{ color: FLAG_COLOR[it.tone] }}>{it.value}</div>
                <div className="text-[11px] text-stone leading-[1.3]" style={{ marginTop: 3 }}>{it.text}</div>
              </div>
            ))}
          </div>
        )}
      </Tile>
    );
  }

  // Variant A — ranked list
  return (
    <Tile title="Standouts" kicker="last 2 weeks">
      {items.length === 0 ? <Empty /> : (
        <div className="flex flex-col">
          {items.map(it => (
            <div key={it.key} className="flex items-center gap-[11px]" style={{ padding: '10px 0', borderTop: '1px solid var(--color-fog)' }}>
              <span className="grid place-items-center rounded-[8px] text-[13px] shrink-0"
                style={{ width: 26, height: 26, background: FLAG_SOFT[it.tone], color: FLAG_COLOR[it.tone] }}>{GLYPH[it.icon]}</span>
              <span className="text-[13px] leading-[1.35]">{it.text}</span>
              <span className="ml-auto font-display text-[17px] tabular-nums">{it.value}</span>
            </div>
          ))}
        </div>
      )}
    </Tile>
  );
}
