// 7-day orientation strip (today..+6): one cell per day showing the day's km
// (run), a sport glyph (ride/strength/yoga) or a race flag, with today on the
// dark hero tile and race days in race-red. Matches the dashboard mockup.

import type { WindowDay } from './data';
import { Dumbbell, BikeGlyph, SwimGlyph, YogaGlyph, BedGlyph } from '@/components/glyphs';
import { RUN, RIDE, SWIM, STRENGTH, YOGA, RUN_B, RIDE_B, SWIM_B, STRENGTH_B, YOGA_B } from '@/lib/colors';

function Flag({ color, size = 17 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.1}
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
    </svg>
  );
}

export default function WeekStrip({ days }: { days: WindowDay[] }) {
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(7,1fr)', gap: '7px', marginBottom: '6px' }}>
      {days.map(day => {
        const isRace  = day.sessions.some(s => s.session_type === 'RACE');
        const isToday = day.isToday;

        // Surface
        const surface = isRace
          ? { background: RACE_BG, color: '#fff' }
          : isToday
            ? { background: 'var(--color-hero)', color: 'var(--color-onhero)' }
            : { background: 'var(--color-paper)', border: '1px solid var(--color-fog)' };

        const wkColor = isRace ? 'rgba(255,255,255,.9)' : isToday ? STRENGTH_B : 'var(--color-ink)';

        // Middle glyph / number
        let middle: React.ReactNode = null;
        if (isRace) middle = <Flag color="#fff" />;
        else if (day.hasRun) middle = (
          <span className="font-display font-bold text-[19px]" style={{ color: isToday ? RUN_B : RUN, lineHeight: 1 }}>{Math.round(day.volumeKm)}</span>
        );
        else if (day.hasRide) middle = <BikeGlyph size={17} strokeWidth={2.1} className="" />;
        else if (day.hasSwim) middle = <SwimGlyph size={17} strokeWidth={2.1} className="" />;
        else if (day.hasStrength) middle = <Dumbbell size={17} strokeWidth={2.1} className="" />;
        else if (day.hasYoga) middle = <YogaGlyph size={17} strokeWidth={2.1} className="" />;
        else middle = <BedGlyph size={16} strokeWidth={2} className="" />;   // rest day

        const midColor = day.hasRide ? (isToday ? RIDE_B : RIDE)
          : day.hasSwim ? (isToday ? SWIM_B : SWIM)
          : day.hasStrength ? (isToday ? STRENGTH_B : STRENGTH)
          : day.hasYoga ? (isToday ? YOGA_B : YOGA)
          // rest day: quiet stone bed (or inherit the light on-hero colour on today's dark tile)
          : (!day.hasRun && !isRace) ? (isToday ? undefined : 'var(--color-stone)')
          : undefined;

        // Bottom label
        const label = isRace ? 'race' : isToday ? 'today'
          : day.hasRun ? 'km' : day.hasRide ? 'ride' : day.hasSwim ? 'swim' : day.hasStrength ? 'lift' : day.hasYoga ? 'yoga' : 'rest';
        const labelBold = isRace || isToday;

        return (
          <div key={day.iso} className="text-center flex flex-col items-center" style={{ ...surface, borderRadius: '12px', padding: '10px 2px', gap: '3px', justifyContent: 'center' }}>
            <div className="text-[10px] font-bold" style={{ color: wkColor }}>{day.short.toUpperCase()}</div>
            <span className="inline-flex items-center justify-center" style={{ color: midColor, minHeight: '19px' }}>{middle}</span>
            <div className="font-semibold" style={{ fontSize: labelBold ? '11px' : '10px', fontWeight: labelBold ? 700 : 600 }}>{label}</div>
          </div>
        );
      })}
    </div>
  );
}

const RACE_BG = '#b3271e';
