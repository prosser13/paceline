'use client';

// Idea 3 — the day-thread grouped into per-week cards with a phase-coloured
// header (the highlight). Past weeks are collapsed into a stack at the top
// ("Earlier weeks") that expands on click — that's the scroll-back-in-time.

import { useState } from 'react';
import { WEEKS, DayBlock, PlanHeader, PHASE_HEX, STONE, type Week } from './_shared';

function WeekCard({ week, defaultOpen }: { week: Week; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const hex = PHASE_HEX[week.phase] ?? STONE;
  const cur = week.state === 'current';
  return (
    <div className="rounded-[13px] overflow-hidden" style={{ border: `2px solid ${hex}${cur ? '' : '55'}` }}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-[16px] py-[11px] text-left"
        style={{ background: cur ? hex : `${hex}12`, color: cur ? '#f4efe4' : undefined }}>
        <div className="flex items-center gap-[9px] min-w-0 flex-wrap">
          <span className="font-display font-semibold text-[14.5px]" style={{ color: cur ? '#f4efe4' : '#17191e' }}>Week {week.weekNumber} · {week.phase}</span>
          <span className="font-mono text-[12.5px]" style={{ color: cur ? 'rgba(244,239,228,.8)' : STONE }}>{week.range}</span>
          {cur && <span className="font-mono text-[9.5px] tracking-[.12em] uppercase rounded-[3px] px-[5px] py-[1px]" style={{ background: 'rgba(244,239,228,.2)' }}>Now</span>}
        </div>
        <div className="flex items-center gap-[12px] shrink-0">
          <span className="font-mono text-[12.5px]" style={{ color: cur ? 'rgba(244,239,228,.85)' : STONE }}>{week.volume} · {week.tss} TSS</span>
          <span style={{ display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms', color: cur ? '#f4efe4' : STONE }}>▾</span>
        </div>
      </button>
      {open && (
        <div className="bg-paper px-[14px] py-[14px] flex flex-col gap-[10px]">
          {week.days.map(d => <DayBlock key={d.iso} day={d} dim={week.state === 'past' && !d.isToday} />)}
        </div>
      )}
    </div>
  );
}

export default function Idea3() {
  const past = WEEKS.filter(w => w.state === 'past');
  const rest = WEEKS.filter(w => w.state !== 'past');
  const [showPast, setShowPast] = useState(false);

  return (
    <div>
      <PlanHeader />

      {past.length > 0 && (
        <div className="mb-3">
          {!showPast ? (
            <button onClick={() => setShowPast(true)}
              className="w-full rounded-[11px] border border-dashed border-fog bg-paper px-[16px] py-[12px] flex items-center justify-between hover:bg-fog/20">
              <span className="font-mono text-[12px] tracking-[.08em] uppercase text-stone">‹ Earlier weeks</span>
              <span className="font-mono text-[12px] text-stone">Weeks {past[0].weekNumber}–{past[past.length - 1].weekNumber} · done</span>
            </button>
          ) : (
            <div className="flex flex-col gap-[10px]">
              <button onClick={() => setShowPast(false)} className="self-start font-mono text-[11.5px] tracking-[.08em] uppercase text-marine px-1">▲ Collapse earlier</button>
              {past.map(w => <WeekCard key={w.weekNumber} week={w} defaultOpen={false} />)}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-[10px]">
        {rest.map(w => <WeekCard key={w.weekNumber} week={w} defaultOpen={w.state === 'current'} />)}
      </div>
    </div>
  );
}
