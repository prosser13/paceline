// Snapshot of a race's actual weather, so the post-race page shows lag-free
// "conditions on the day" without re-fetching (and archive data can't disappear).

import { supabaseAdmin } from '@/lib/supabase-admin';
import type { RaceForecast } from '@/lib/weather';

export interface RaceWeather {
  forecast: RaceForecast;
  source: string;
}

export async function getRaceWeather(slug: string): Promise<RaceWeather | null> {
  const { data } = await supabaseAdmin
    .from('race_weather').select('forecast, source').eq('slug', slug).maybeSingle();
  if (!data?.forecast) return null;
  return { forecast: data.forecast as RaceForecast, source: data.source as string };
}

export async function upsertRaceWeather(
  slug: string, raceDate: string | null, forecast: RaceForecast, source: string,
): Promise<void> {
  await supabaseAdmin.from('race_weather')
    .upsert({ slug, race_date: raceDate, forecast, source }, { onConflict: 'slug' });
}
