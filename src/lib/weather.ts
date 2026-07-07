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
    apparent_temperature?: number[];       // archive/ERA5 may omit
    precipitation?: number[];
    precipitation_probability?: number[];  // forecast-only
    weather_code: number[];
    wind_speed_10m: number[];
    wind_gusts_10m?: number[];
  };
}

function within16Days(dateISO: string): boolean {
  const target = new Date(dateISO + 'T00:00:00').getTime();
  const now = Date.now();
  const days = (target - now) / 86400000;
  return days >= -1 && days <= 16;
}

// Map an Open-Meteo hourly response (forecast OR archive — same field names) into
// a RaceForecast. Archive (ERA5) omits precipitation_probability and can omit
// apparent_temperature, so both are read defensively.
function mapOpenMeteo(json: OpenMeteoResponse, dateISO: string): RaceForecast | null {
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
      feelsC: Math.round(h.apparent_temperature?.[i] ?? h.temperature_2m[i]),
      windKph: Math.round(h.wind_speed_10m[i]),
      gustKph: Math.round(h.wind_gusts_10m?.[i] ?? h.wind_speed_10m[i]),
      precipMm: h.precipitation?.[i] ?? 0,
      precipProb: Math.round(h.precipitation_probability?.[i] ?? 0),
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

const HOURLY_KEYS =
  'temperature_2m,apparent_temperature,precipitation,precipitation_probability,' +
  'weather_code,wind_speed_10m,wind_gusts_10m';

async function fetchOpenMeteo(base: string, lat: number, lng: number, dateISO: string): Promise<OpenMeteoResponse | null> {
  const url = `${base}?latitude=${lat}&longitude=${lng}&hourly=${HOURLY_KEYS}` +
    `&wind_speed_unit=kmh&timezone=Europe%2FLondon&start_date=${dateISO}&end_date=${dateISO}`;
  try {
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 6 } });
    if (!res.ok) return null;
    return (await res.json()) as OpenMeteoResponse;
  } catch {
    return null;
  }
}

export async function getRaceForecast(
  lat: number,
  lng: number,
  dateISO: string,
): Promise<RaceForecast | null> {
  if (!within16Days(dateISO)) return null;
  const json = await fetchOpenMeteo('https://api.open-meteo.com/v1/forecast', lat, lng, dateISO);
  return json ? mapOpenMeteo(json, dateISO) : null;
}

// ── Daily run conditions + heat-adjusted pace (PB-campaign wave 4) ────────────
//
// A lighter fetch than the race forecast: just temperature + dewpoint per hour for
// one day, so the dashboard can preview the heat penalty at the athlete's intended
// run hour. Runs only. Times are Europe/London (the app's timezone assumption).

export interface RunHourCondition { hour: number; tempC: number; dewC: number; }

export async function getRunConditions(lat: number, lng: number, dateISO: string): Promise<RunHourCondition[] | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&hourly=temperature_2m,dew_point_2m&timezone=Europe%2FLondon&start_date=${dateISO}&end_date=${dateISO}`;
  try {
    const res = await fetch(url, { next: { revalidate: 60 * 60 } });   // 1h cache
    if (!res.ok) return null;
    const json = (await res.json()) as { hourly?: { time: string[]; temperature_2m: number[]; dew_point_2m: number[] } };
    const h = json.hourly;
    if (!h?.time?.length) return null;
    const out: RunHourCondition[] = [];
    for (let i = 0; i < h.time.length; i++) {
      if (h.temperature_2m[i] == null) continue;
      out.push({ hour: Number(h.time[i].slice(11, 13)), tempC: Math.round(h.temperature_2m[i]), dewC: Math.round(h.dew_point_2m?.[i] ?? h.temperature_2m[i]) });
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

// Resolve a place name to coordinates via Open-Meteo's free geocoder, so the
// athlete can type "Bristol" rather than latitude/longitude.
export async function geocodePlace(name: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const q = name.trim();
  if (!q) return null;
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1`);
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: { name: string; latitude: number; longitude: number; admin1?: string; country_code?: string }[] };
    const r = json.results?.[0];
    if (!r) return null;
    return { lat: r.latitude, lng: r.longitude, label: [r.name, r.admin1, r.country_code].filter(Boolean).join(', ') };
  } catch {
    return null;
  }
}

export interface HeatPenalty { pct: number; secPerKm: number; }

// Heat penalty on running pace from temperature + dewpoint. A deliberately simple
// model (to be refined): no penalty in cool air, growing with heat and — via the
// dewpoint — humidity. Pure, so the client can recompute as the previewed hour
// changes. Below ~3 s/km the caller should treat it as "no penalty".
export function heatPenalty(tempC: number, dewC: number, planPaceSec: number): HeatPenalty {
  const base = Math.max(0, tempC - 15);            // cool below 15°C
  const humidity = Math.max(0, dewC - 12) * 0.5;   // sticky air adds to it
  const pct = Math.min(12, (base + humidity) * 0.3);
  return { pct: Math.round(pct * 10) / 10, secPerKm: Math.round((planPaceSec * pct) / 100) };
}

// Race-day weather for a PAST date (post-race). Recent days come from the forecast
// endpoint (which serves the last few days); older dates from the ERA5 archive,
// which lags ~5 days. Returns the forecast + which source it came from (so it can
// be snapshotted).
export async function getRaceWeatherHistory(
  lat: number, lng: number, dateISO: string,
): Promise<{ forecast: RaceForecast; source: 'forecast' | 'archive' } | null> {
  const daysAgo = (Date.now() - new Date(dateISO + 'T00:00:00').getTime()) / 86400000;
  const useArchive = daysAgo > 5;
  const base = useArchive
    ? 'https://archive-api.open-meteo.com/v1/archive'
    : 'https://api.open-meteo.com/v1/forecast';
  const json = await fetchOpenMeteo(base, lat, lng, dateISO);
  const forecast = json ? mapOpenMeteo(json, dateISO) : null;
  return forecast ? { forecast, source: useArchive ? 'archive' : 'forecast' } : null;
}
