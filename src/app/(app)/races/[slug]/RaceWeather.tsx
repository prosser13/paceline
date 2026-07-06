// Post-race "weather on the day". Uses a stored snapshot if present; otherwise
// fetches the historical weather once (Open-Meteo archive/forecast), snapshots it
// (best-effort), and shows it. Falls back to the curated seasonal note.

import { getRaceWeather, upsertRaceWeather } from '@/data/race-weather';
import { getRaceWeatherHistory, type RaceForecast } from '@/lib/weather';
import WeatherPanel from './WeatherPanel';

export default async function RaceWeather({
  slug, lat, lng, dateISO, seasonal, raceDateLabel,
}: {
  slug: string; lat: number; lng: number; dateISO: string | null;
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

  return <WeatherPanel forecast={forecast} seasonal={seasonal} raceDateLabel={raceDateLabel} past />;
}
