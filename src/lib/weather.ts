// Race-day weather via Open-Meteo — a free, keyless forecast API. The hourly
// forecast reaches ~16 days ahead; beyond that we return null and the UI falls
// back to the curated seasonal note. Fetched server-side and cached with Next's
// fetch revalidate so a race page doesn't hammer the API.

export interface WeatherHour {
  time: string;        // ISO local hour
  hourLabel: string;   // "08:00"
  tempC: number;
  feelsC: number;
  windKph: number;
  gustKph: number;
  precipMm: number;
  precipProb: number;  // %
  code: number;        // WMO weather code
}

export interface RaceForecast {
  date: string;        // yyyy-mm-dd
  hours: WeatherHour[];          // race-window hours (06:00–24:00)
  high: number;
  low: number;
  maxWindKph: number;
  maxPrecipProb: number;
  summary: string;
}

// WMO weather code → short label (the codes Open-Meteo returns).
export function weatherLabel(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 2) return 'Mostly clear';
  if (code === 3) return 'Overcast';
  if (code <= 48) return 'Fog';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Showers';
  if (code <= 86) return 'Snow showers';
  return 'Thunderstorm';
}

interface OpenMeteoResponse {
  hourly?: {
    time: string[];
    temperature_2m: number[];
    apparent_temperature: number[];
    precipitation: number[];
    precipitation_probability: number[];
    weather_code: number[];
    wind_speed_10m: number[];
    wind_gusts_10m: number[];
  };
}

function within16Days(dateISO: string): boolean {
  const target = new Date(dateISO + 'T00:00:00').getTime();
  const now = Date.now();
  const days = (target - now) / 86400000;
  return days >= -1 && days <= 16;
}

export async function getRaceForecast(
  lat: number,
  lng: number,
  dateISO: string,
): Promise<RaceForecast | null> {
  if (!within16Days(dateISO)) return null;

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&hourly=temperature_2m,apparent_temperature,precipitation,precipitation_probability,` +
    `weather_code,wind_speed_10m,wind_gusts_10m` +
    `&wind_speed_unit=kmh&timezone=Europe%2FLondon` +
    `&start_date=${dateISO}&end_date=${dateISO}`;

  let json: OpenMeteoResponse;
  try {
    // Revalidate every 3 hours — the forecast updates a few times a day.
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 3 } });
    if (!res.ok) return null;
    json = (await res.json()) as OpenMeteoResponse;
  } catch {
    return null;
  }

  const h = json.hourly;
  if (!h?.time?.length) return null;

  const hours: WeatherHour[] = [];
  for (let i = 0; i < h.time.length; i++) {
    const hour = Number(h.time[i].slice(11, 13));
    if (hour < 6) continue; // race window starts in the morning
    hours.push({
      time: h.time[i],
      hourLabel: h.time[i].slice(11, 16),
      tempC: Math.round(h.temperature_2m[i]),
      feelsC: Math.round(h.apparent_temperature[i]),
      windKph: Math.round(h.wind_speed_10m[i]),
      gustKph: Math.round(h.wind_gusts_10m[i]),
      precipMm: h.precipitation[i],
      precipProb: Math.round(h.precipitation_probability[i] ?? 0),
      code: h.weather_code[i],
    });
  }

  if (!hours.length) return null;

  const temps = hours.map(x => x.tempC);
  const high = Math.max(...temps);
  const low = Math.min(...temps);
  const maxWindKph = Math.max(...hours.map(x => x.windKph));
  const maxPrecipProb = Math.max(...hours.map(x => x.precipProb));

  // Pick the dominant daytime weather code (mode) for the summary label.
  const midday = hours.find(x => x.hourLabel === '13:00') ?? hours[Math.floor(hours.length / 2)];
  const summary =
    `${weatherLabel(midday.code)}, ${low}–${high}°C` +
    `${maxPrecipProb >= 40 ? `, ${maxPrecipProb}% chance of rain` : ''}` +
    `${maxWindKph >= 30 ? `, windy (gusts to ${Math.max(...hours.map(x => x.gustKph))} km/h)` : ''}`;

  return { date: dateISO, hours, high, low, maxWindKph, maxPrecipProb, summary };
}
