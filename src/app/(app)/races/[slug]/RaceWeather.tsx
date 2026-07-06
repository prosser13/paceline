// Post-race "weather on the day" — focused on the race window (about an hour
// before through the finish), not the whole day. Uses a stored snapshot if
// present; otherwise fetches historical weather once and snapshots it. Renders a
// compact temperature graphic with the race window highlighted.

import { CardTitle, cardClass } from '@/components/dashboard-graphics';
import { getRaceWeather, upsertRaceWeather } from '@/data/race-weather';
import { getRaceWeatherHistory, weatherLabel, type RaceForecast, type WeatherHour } from '@/lib/weather';

export default async function RaceWeather({
  slug, lat, lng, dateISO, startTime, durationMins, seasonal, raceDateLabel,
}: {
  slug: string; lat: number; lng: number; dateISO: string | null;
  startTime: string | null; durationMins: number | null;
  seasonal: string; raceDateLabel: string | null;
}) {
  let forecast: RaceForecast | null = null;
  const snapshot = await getRaceWeather(slug);
  if (snapshot) {
    forecast = snapshot.forecast;
  } else if (dateISO) {
    const hist = await getRaceWeatherHistory(lat, lng, dateISO);
    if (hist) {
      forecast = hist.forecast;
      try { await upsertRaceWeather(slug, dateISO, hist.forecast, hist.source); } catch { /* best-effort */ }
    }
  }

  // Race window: an hour before the gun through the finish (+30 min buffer).
  const startH = startTime ? Number(startTime.slice(0, 2)) : 9;
  const startM = startTime ? Number(startTime.slice(3, 5)) : 0;
  const startMinutes = startH * 60 + startM;
  const finishMinutes = startMinutes + (durationMins ?? 90);
  const winFrom = startMinutes - 60;
  const winTo = finishMinutes + 30;
  const hourMin = (h: WeatherHour) => Number(h.time.slice(11, 13)) * 60;
  const during = (h: WeatherHour) => hourMin(h) >= startMinutes - 30 && hourMin(h) <= finishMinutes + 30;

  const windowHours = forecast?.hours.filter(h => hourMin(h) >= winFrom && hourMin(h) <= winTo) ?? [];

  if (!forecast || windowHours.length === 0) {
    return (
      <div className={cardClass}>
        <div className="px-[18px] py-[15px]">
          <CardTitle right={raceDateLabel ?? undefined}>Weather on the day</CardTitle>
          <p className="text-[14px] text-ink leading-relaxed">{seasonal}</p>
          <p className="font-mono text-[11px] text-stone mt-[12px] border-t border-fog pt-[10px]">Actual conditions weren’t recorded for this race.</p>
        </div>
      </div>
    );
  }

  const temps = windowHours.map(h => h.tempC);
  const high = Math.max(...temps), low = Math.min(...temps);
  const maxWind = Math.max(...windowHours.map(h => h.windKph));
  const maxRain = Math.max(...windowHours.map(h => h.precipProb));
  const startHour = windowHours.find(during) ?? windowHours[0];

  // SVG temp line across the window.
  const W = 300, H = 60, pad = 6;
  const n = windowHours.length;
  const span = Math.max(1, high - low);
  const x = (i: number) => pad + (n === 1 ? (W - 2 * pad) / 2 : (i * (W - 2 * pad)) / (n - 1));
  const y = (t: number) => pad + (H - 2 * pad) * (1 - (t - low) / span);
  const pts = windowHours.map((h, i) => `${x(i)},${y(h.tempC)}`).join(' ');
  const firstDuring = windowHours.findIndex(during);
  const lastDuring = windowHours.length - 1 - [...windowHours].reverse().findIndex(during);

  return (
    <div className={cardClass}>
      <div className="px-[18px] py-[15px]">
        <CardTitle right={raceDateLabel ?? undefined}>Weather on the day</CardTitle>
        <div className="flex items-baseline gap-[10px] mb-[2px]">
          <span className="font-display font-semibold text-[26px] leading-none text-ink">{low}–{high}°C</span>
          <span className="text-[14px] text-stone">{weatherLabel(startHour.code)} at the start · feels {startHour.feelsC}°</span>
        </div>
        <div className="text-[12px] text-stone mb-[10px]">During the race: {forecast.summary}</div>

        {/* temp line with the race window shaded */}
        <svg viewBox={`0 0 ${W} ${H + 26}`} className="w-full" style={{ maxHeight: '92px' }} role="img" aria-label="Temperature across the race window">
          {firstDuring >= 0 && (
            <rect x={x(firstDuring) - 8} y={0} width={x(lastDuring) - x(firstDuring) + 16} height={H} rx={4} fill="var(--color-race)" opacity={0.10} />
          )}
          <polyline points={pts} fill="none" stroke="var(--color-run)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {windowHours.map((h, i) => (
            <g key={h.time}>
              <circle cx={x(i)} cy={y(h.tempC)} r={during(h) ? 3.2 : 2.4} fill={during(h) ? 'var(--color-race)' : 'var(--color-run)'} />
              <text x={x(i)} y={y(h.tempC) - 7} textAnchor="middle" className="fill-ink" style={{ fontSize: '10px', fontWeight: 700 }}>{h.tempC}°</text>
              <text x={x(i)} y={H + 10} textAnchor="middle" className="fill-stone" style={{ fontSize: '9px' }}>{h.hourLabel}</text>
              <text x={x(i)} y={H + 21} textAnchor="middle" className="fill-marine" style={{ fontSize: '8.5px' }}>{h.windKph}km/h</text>
            </g>
          ))}
        </svg>

        <div className="mt-[10px] flex flex-wrap gap-x-[18px] gap-y-[4px] border-t border-fog pt-[10px]">
          <Stat label="Start" value={`${startHour.tempC}° · ${startHour.windKph} km/h`} />
          <Stat label="Max wind" value={`${maxWind} km/h`} />
          <Stat label="Rain chance" value={`${maxRain}%`} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <span className="font-mono text-[12px] text-stone">{label} <b className="text-ink">{value}</b></span>;
}
