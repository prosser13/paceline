// Training-location config (PB-campaign wave 4) — the single-row weather_config
// table. Daily heat-adjusted paces use the `override` location when set (travel),
// else `home`. One home for this cluster so per-user scoping lands here later.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentUserId } from '@/lib/scope';

export interface WeatherConfig {
  home_lat: number | null;
  home_lng: number | null;
  home_label: string | null;
  override_lat: number | null;
  override_lng: number | null;
  override_label: string | null;
  default_hour: number;
}

export interface EffectiveLocation { lat: number; lng: number; label: string | null; away: boolean; }

export async function getWeatherConfig(): Promise<WeatherConfig | null> {
  const userId = await currentUserId();
  const { data } = await supabaseAdmin
    .from('weather_config')
    .select('home_lat, home_lng, home_label, override_lat, override_lng, override_label, default_hour')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as WeatherConfig | null) ?? null;
}

// The location to forecast for: the override (travel) when set, else home. Null
// until a home location is configured.
export function effectiveLocation(cfg: WeatherConfig | null): EffectiveLocation | null {
  if (!cfg) return null;
  if (cfg.override_lat != null && cfg.override_lng != null) {
    return { lat: Number(cfg.override_lat), lng: Number(cfg.override_lng), label: cfg.override_label, away: true };
  }
  if (cfg.home_lat != null && cfg.home_lng != null) {
    return { lat: Number(cfg.home_lat), lng: Number(cfg.home_lng), label: cfg.home_label, away: false };
  }
  return null;
}

export async function setHomeLocation(lat: number, lng: number, label: string | null, defaultHour: number): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('weather_config').upsert({
    user_id: userId, home_lat: lat, home_lng: lng, home_label: label,
    default_hour: defaultHour, updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

export async function setOverrideLocation(lat: number, lng: number, label: string | null): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('weather_config').update({
    override_lat: lat, override_lng: lng, override_label: label, updated_at: new Date().toISOString(),
  }).eq('user_id', userId);
}

export async function clearOverrideLocation(): Promise<void> {
  const userId = await currentUserId();
  await supabaseAdmin.from('weather_config').update({
    override_lat: null, override_lng: null, override_label: null, updated_at: new Date().toISOString(),
  }).eq('user_id', userId);
}
