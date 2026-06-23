'use client';

// 7-day orientation strip (today..+6): one column per day with a volume bar,
// type glyph(s) and a today highlight. Clicking a day scrolls the agenda spine
// to that day's node.

import type { WindowDay } from './data';
import { RunGlyph, Dumbbell, BikeGlyph, YogaGlyph } from '@/components/glyphs';
import { OXBLOOD, MARINE, FERN, GOLD, FOG, AMBER, EMBER } from '@/lib/colors';

function BedMini({ color }: { color: string }) {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2}
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7v11M3 12h13a4 4 0 0 1 4 4v2M3 18h18" />
    </svg>
  );
}

export default function WeekStrip({ days, weekLabel, todayDone }: {
  days: WindowDay[]; weekLabel: string; todayDone: boolean;
}) {
  const maxKm = Math.max(...days.map(d => d.volumeKm), 1);

  function scrollToDay(iso: string) {
    const el = document.getElementById(`spine-${iso}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="border border-fog rounded-[14px] bg-paper px-[16px] py-[13px] mb-5">
      <div className="font-mono text-[11px] uppercase tracking-[.14em] text-stone mb-[10px]">{weekLabel} · next 7 days</div>
      <div className="flex gap-[6px]">
        {days.map(day => {
          const isRest = day.sessions.length === 0;
          const barH = isRest ? 5 : Math.max(8, Math.round((day.volumeKm / maxKm) * 46));
          const barColor = day.isToday ? OXBLOOD : isRest ? FOG : (day.hasRun || day.hasRide) ? MARINE : GOLD;
          const labelColor = day.isToday ? AMBER : '#5f5a50';
          return (
            <button key={day.iso} type="button" onClick={() => scrollToDay(day.iso)}
              className="flex-1 flex flex-col items-center gap-[6px] rounded-[8px] py-[6px] cursor-pointer transition-colors hover:bg-fog/25"
              style={day.isToday ? { outline: `1.5px solid ${AMBER}` } : undefined}
              aria-label={`Jump to ${day.short} ${day.dateLabel}`}>
              <span className="font-mono text-[10px] uppercase tracking-[.06em]" style={{ color: labelColor }}>{day.short}</span>
              <div className="flex items-end" style={{ height: '46px' }}>
                <div className="w-[8px] rounded-[3px]" style={{ height: `${barH}px`, background: barColor }} />
              </div>
              <div className="flex items-center gap-[2px] h-[15px]">
                {day.isToday && todayDone ? (
                  <span className="text-[13px] leading-none" style={{ color: FERN }}>✓</span>
                ) : isRest ? (
                  <BedMini color="#a39c8c" />
                ) : (
                  <>
                    {day.hasRun && (
                      <span className="inline-flex" style={{ color: day.isToday ? OXBLOOD : MARINE }}>
                        <RunGlyph size={13} strokeWidth={2.2} className="" />
                      </span>
                    )}
                    {day.hasRide && (
                      <span className="inline-flex" style={{ color: day.isToday ? OXBLOOD : MARINE }}>
                        <BikeGlyph size={13} strokeWidth={2.2} className="" />
                      </span>
                    )}
                    {day.hasStrength && (
                      <span className="inline-flex" style={{ color: GOLD }}>
                        <Dumbbell size={13} strokeWidth={2.2} className="" />
                      </span>
                    )}
                    {day.hasYoga && (
                      <span className="inline-flex" style={{ color: EMBER }}>
                        <YogaGlyph size={13} strokeWidth={2.2} className="" />
                      </span>
                    )}
                  </>
                )}
              </div>
              <span className="font-mono text-[10px] text-stone leading-none">{day.volumeKm > 0 ? `${Math.round(day.volumeKm)}k` : '·'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
