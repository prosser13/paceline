// Streams the heat-adjusted-pace widget for today's run (PB-campaign wave 4).
// Renders nothing until a home training location is configured, or if the forecast
// / plan pace is unavailable. Kept behind its own <Suspense> so the Open-Meteo
// fetch can't hold up the agenda.
import { getWeatherConfig, effectiveLocation } from '@/data/weather-config';
import { getRunConditions } from '@/lib/weather';
import { paceToSeconds } from '@/lib/plan-structure';
import RunWeatherWidget from './RunWeatherWidget';

export default async function RunWeatherAsync({ dateISO, planPace, planPaceEnd }: {
  dateISO: string; planPace: string; planPaceEnd?: string | null;
}) {
  const cfg = await getWeatherConfig();
  const loc = effectiveLocation(cfg);
  if (!cfg || !loc) return null;
  const planPaceSec = paceToSeconds(planPace);
  if (planPaceSec == null) return null;
  const hours = await getRunConditions(loc.lat, loc.lng, dateISO);
  if (!hours?.length) return null;
  return (
    <RunWeatherWidget
      hours={hours}
      defaultHour={cfg.default_hour ?? 7}
      planPaceLabel={planPace}
      planPaceSec={planPaceSec}
      planPaceEndLabel={planPaceEnd ?? null}
      locationLabel={loc.label}
      away={loc.away}
    />
  );
}
