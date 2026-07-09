import { Suspense } from 'react';
import { RACE_PRIORITY_BADGE } from '@/lib/colors';
import NextRaceWeather from './NextRaceWeather';

// Compact "next race" tile for the dashboard metric strip — nearest upcoming
// race with its A/B/C priority badge and a days-to-go countdown. When the race is
// close enough for a forecast, the day's peak temperature + a weather glyph stream
// into the header's spare space (see NextRaceWeather).
export default function NextRaceCard({
  name, daysTo, dateStr, priority, raceDateISO, raceSlug,
}: {
  name: string; daysTo: number | null; dateStr: string | null; priority: string | null; km?: number | null; raceDateISO?: string | null; raceSlug?: string | null;
}) {
  const badge = priority ? (RACE_PRIORITY_BADGE[priority] ?? RACE_PRIORITY_BADGE.A) : null;
  return (
    <div className="border border-fog rounded-[16px] bg-paper" style={{ padding: '15px 17px' }}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase font-bold text-race" style={{ letterSpacing: '.06em' }}>Next race</div>
        {raceDateISO && (
          <Suspense fallback={null}>
            <NextRaceWeather dateISO={raceDateISO} slug={raceSlug} />
          </Suspense>
        )}
      </div>
      <div className="font-display font-bold text-[17px]" style={{ margin: '7px 0 2px' }}>{name}</div>
      <div className="flex justify-between" style={{ alignItems: 'flex-end' }}>
        <div>
          <span className="text-[13px] font-semibold">{dateStr}</span>
          {priority && badge && (
            <span
              className="text-[11px] font-bold align-middle"
              style={{ background: badge.bg, color: badge.fg, padding: '2px 9px', borderRadius: '20px', marginLeft: '4px' }}
            >
              {priority} race
            </span>
          )}
        </div>
        {daysTo != null && (
          <div className="font-display font-bold text-[30px] text-race" style={{ lineHeight: 1 }}>
            {daysTo}<span className="text-[14px]">d</span>
          </div>
        )}
      </div>
    </div>
  );
}
