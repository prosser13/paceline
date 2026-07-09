// Race-day weather for the dashboard "Next race" pill: the day's peak temperature
// plus a condition glyph. Shown only when a forecast is available — the race is
// within Open-Meteo's ~16-day horizon AND its location is known from the curated
// race guide (matched by date). The forecast is server-fetched and cached ~6h by
// getRaceForecast, so this adds no per-request cost after the first load of the
// window (a few refreshes a day). Streamed behind its own <Suspense> so it never
// holds up the metric strip.

import { listRaceGuides, getRaceGuide } from '@/data/races';
import { getRaceForecast, weatherLabel } from '@/lib/weather';

// Compact condition glyph, bucketed from the WMO weather code (same buckets as
// weatherLabel). currentColor so the caller sets the tint.
function WeatherGlyph({ code, className = '' }: { code: number; className?: string }) {
  const clear = code <= 2;                                   // clear / mostly clear
  const rain  = (code >= 51 && code <= 67) || (code >= 80 && code <= 82);
  const snow  = (code >= 71 && code <= 77) || (code >= 85 && code <= 86);
  const storm = code >= 95;
  const cloud = 'M7 15.2h9.2a3.3 3.3 0 0 0 .3-6.57 4.8 4.8 0 0 0-9.15-1A3.8 3.8 0 0 0 7 15.2z';

  if (clear) {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
        <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.5 1.5M17.9 17.9l1.5 1.5M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.5-1.5M17.9 6.1l1.5-1.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d={cloud} fill="currentColor" opacity={storm || rain || snow ? 0.85 : 1} />
      {rain && <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 17.5v3M12 17.8v3M15 17.5v3" /></g>}
      {snow && <g fill="currentColor"><circle cx="9" cy="19" r="1.1" /><circle cx="12" cy="20" r="1.1" /><circle cx="15" cy="19" r="1.1" /></g>}
      {storm && <path d="M12.5 16l-3 4h2.2l-1.2 3.2 4-4.4h-2.3l1.3-2.8z" fill="currentColor" />}
    </svg>
  );
}

export default async function NextRaceWeather({ dateISO, slug }: { dateISO: string; slug?: string | null }) {
  // Resolve the race location: the goal-race guide is keyed by slug (no date on it);
  // dated tune-up guides match by date.
  const guide = (slug ? getRaceGuide(slug) : null) ?? listRaceGuides().find(g => g.date === dateISO) ?? null;
  if (!guide) return null;

  const forecast = await getRaceForecast(guide.start.lat, guide.start.lng, dateISO);
  if (!forecast) return null;

  const rep = forecast.hours.find(h => h.hourLabel === '13:00') ?? forecast.hours[Math.floor(forecast.hours.length / 2)];

  return (
    <div className="flex items-center gap-[5px] shrink-0" title={forecast.summary}>
      <WeatherGlyph code={rep.code} className="w-[16px] h-[16px] text-stone" />
      <span className="font-display font-bold text-[15px] text-ink tabular-nums" aria-label={`Race-day high ${forecast.high}°, ${weatherLabel(rep.code)}`}>
        {forecast.high}°
      </span>
    </div>
  );
}
