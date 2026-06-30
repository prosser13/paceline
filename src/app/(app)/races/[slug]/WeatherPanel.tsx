// Race-day weather. Shows the live Open-Meteo forecast when within the 16-day
// window, otherwise the curated seasonal note.

import { CardTitle, cardClass } from '@/components/dashboard-graphics';
import { weatherLabel, type RaceForecast } from '@/lib/weather';

export default function WeatherPanel({
  forecast,
  seasonal,
  raceDateLabel,
}: {
  forecast: RaceForecast | null;
  seasonal: string;
  raceDateLabel: string | null;
}) {
  return (
    <div className={cardClass}>
      <div className="px-[18px] py-[15px]">
        <CardTitle right={raceDateLabel ?? undefined}>Race-day weather</CardTitle>
        {forecast ? (
          <>
            <div className="flex items-baseline gap-[10px] mb-[4px]">
              <span className="font-display font-semibold text-[26px] leading-none text-ink">
                {forecast.low}–{forecast.high}°C
              </span>
              <span className="text-[14px] text-stone">{forecast.summary}</span>
            </div>

            {/* hourly strip across the race window */}
            <div className="mt-[14px] flex gap-[6px] overflow-x-auto pb-[4px]">
              {forecast.hours
                .filter((_, i) => i % 2 === 0) // every 2 h to keep it tidy
                .map(h => (
                  <div key={h.time} className="flex flex-col items-center gap-[3px] min-w-[44px]">
                    <span className="font-mono text-[10px] text-stone">{h.hourLabel}</span>
                    <span className="font-display font-semibold text-[14px] text-ink">{h.tempC}°</span>
                    <span className="font-mono text-[9px] text-stone leading-tight text-center">{weatherLabel(h.code)}</span>
                    <span className="font-mono text-[9px] text-marine">{h.windKph}km/h</span>
                    {h.precipProb >= 30 && (
                      <span className="font-mono text-[9px] text-oxblood">{h.precipProb}%</span>
                    )}
                  </div>
                ))}
            </div>

            <div className="mt-[12px] flex flex-wrap gap-x-[18px] gap-y-[4px] border-t border-fog pt-[10px]">
              <Stat label="Max wind" value={`${forecast.maxWindKph} km/h`} />
              <Stat label="Rain chance" value={`${forecast.maxPrecipProb}%`} />
            </div>
          </>
        ) : (
          <>
            <p className="font-mono text-[11px] uppercase tracking-[.1em] text-stone mb-[8px]">
              Typical conditions
            </p>
            <p className="text-[14px] text-ink leading-relaxed">{seasonal}</p>
            <p className="font-mono text-[11px] text-stone mt-[12px] border-t border-fog pt-[10px]">
              A live forecast appears here automatically within ~16 days of race day.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="font-mono text-[12px] text-stone">
      {label} <b className="text-ink">{value}</b>
    </span>
  );
}
