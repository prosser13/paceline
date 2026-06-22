'use client';

// Idea 1 — one continuous day-thread. Weeks are marked by a highlighted band
// inserted inline between days; the current week's band is solid (emphasis).
// "Scroll back in time" = past weeks are folded above behind a reveal control.

import { useState } from 'react';
import { WEEKS, DayBlock, WeekBand, PlanHeader, type Week } from './_shared';

function WeekSection({ week, dim }: { week: Week; dim?: boolean }) {
  return (
    <div className="mb-4">
      <div className="mb-[10px]"><WeekBand week={week} emphasis={week.state === 'current'} /></div>
      <div className="flex flex-col gap-[10px] pl-[2px]">
        {week.days.map(d => <DayBlock key={d.iso} day={d} dim={dim && !d.isToday} />)}
      </div>
    </div>
  );
}

export default function Idea1() {
  const past = WEEKS.filter(w => w.state === 'past');
  const rest = WEEKS.filter(w => w.state !== 'past');
  const [showPast, setShowPast] = useState(false);

  return (
    <div>
      <PlanHeader />

      <div className="flex items-center justify-center mb-3">
        <button onClick={() => setShowPast(s => !s)}
          className="font-mono text-[12px] tracking-[.08em] uppercase text-marine border border-fog rounded-full px-4 py-[7px] bg-paper hover:bg-fog/30">
          {showPast ? '▲ Hide earlier weeks' : `▼ Load ${past.length} earlier weeks`}
        </button>
      </div>

      {showPast && past.map(w => <WeekSection key={w.weekNumber} week={w} dim />)}
      {rest.map(w => <WeekSection key={w.weekNumber} week={w} />)}
    </div>
  );
}
