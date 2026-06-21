'use client';

// Idea 2 — two columns. A sticky left rail lists every week (phase-coloured,
// current highlighted) and is the time-machine: click a week to jump the thread
// to it, including back in time. The right column is the continuous day-thread.

import { useRef } from 'react';
import { WEEKS, DayBlock, PlanHeader, PHASE_HEX, STONE } from './_shared';

export default function Idea2() {
  const refs = useRef<Record<number, HTMLDivElement | null>>({});

  function jump(n: number) {
    refs.current[n]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div>
      <PlanHeader />
      <div className="flex gap-[18px] items-start">
        {/* Week rail */}
        <div className="w-[150px] shrink-0 sticky top-[6px] flex flex-col gap-[6px]">
          <div className="font-mono text-[10px] tracking-[.14em] uppercase text-stone mb-[2px] px-1">Weeks</div>
          {WEEKS.map(w => {
            const hex = PHASE_HEX[w.phase] ?? STONE;
            const cur = w.state === 'current';
            return (
              <button key={w.weekNumber} onClick={() => jump(w.weekNumber)}
                className={`text-left rounded-[9px] px-[10px] py-[8px] border transition-colors ${cur ? '' : 'hover:bg-fog/40'} ${w.state === 'past' ? 'opacity-65' : ''}`}
                style={{ borderColor: `${hex}${cur ? '' : '40'}`, background: cur ? `${hex}1a` : 'transparent' }}>
                <div className="flex items-center gap-[6px]">
                  <i className="inline-block w-[7px] h-[7px] rounded-[2px]" style={{ background: hex }} />
                  <span className="font-display font-semibold text-[13.5px] text-ink">Wk {w.weekNumber}</span>
                  {cur && <span className="font-mono text-[9px] tracking-[.1em] uppercase rounded-[3px] px-[4px]" style={{ background: `${hex}26`, color: hex }}>now</span>}
                </div>
                <div className="font-mono text-[11px] text-stone mt-[3px]">{w.range}</div>
                <div className="font-mono text-[11px] text-stone mt-[1px]">{w.volume} · {w.tss} TSS</div>
              </button>
            );
          })}
        </div>

        {/* Day thread */}
        <div className="flex-1 min-w-0 flex flex-col gap-[10px]">
          {WEEKS.map(w => (
            <div key={w.weekNumber} ref={el => { refs.current[w.weekNumber] = el; }} style={{ scrollMarginTop: '10px' }}
              className="flex flex-col gap-[10px]">
              <div className="flex items-center gap-[8px] pt-1">
                <span className="font-display font-semibold text-[13.5px]" style={{ color: PHASE_HEX[w.phase] }}>Week {w.weekNumber} · {w.phase}</span>
                <span className="h-px flex-1" style={{ background: `${PHASE_HEX[w.phase]}40` }} />
              </div>
              {w.days.map(d => <DayBlock key={d.iso} day={d} dim={w.state === 'past' && !d.isToday} />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
