export const dynamic = 'force-dynamic';

import AppShell from '@/components/AppShell';
import { supabaseAdmin } from '@/lib/supabase-admin';
import SettingsClient from './SettingsClient';
import ZonesClient from './ZonesClient';
import type { ZoneInput } from './actions';

export default async function SettingsPage() {
  const [{ data: strava }, { data: config }, { data: paceZones }] = await Promise.all([
    supabaseAdmin
      .from('strava_connection')
      .select('athlete_name, connected_at, last_synced_at')
      .eq('id', 1)
      .single(),
    supabaseAdmin.from('app_config').select('threshold_pace_per_km').limit(1).maybeSingle(),
    supabaseAdmin.from('pace_zones').select('*').order('sort_order'),
  ]);

  const threshold = config?.threshold_pace_per_km ?? '3:40';
  const zones: ZoneInput[] = (paceZones ?? []).map(z => ({
    name:     z.name,
    pace_min: z.pace_min,
    pace_max: z.pace_max,
  }));

  return (
    <AppShell>
      <div className="px-[26px] py-[22px] max-w-[720px]">
        <h1 className="font-display font-semibold text-[24px] mb-6">Settings</h1>

        <section className="border border-fog rounded-[14px] bg-paper overflow-hidden mb-5">
          <div className="px-[18px] py-[14px] border-b border-fog">
            <span className="font-mono text-[12px] tracking-[.14em] uppercase text-stone">Pace zones</span>
          </div>
          <div className="px-[18px] py-[18px]">
            <p className="text-[15px] text-stone mb-4">
              Planned sessions are built from zones — the paces shown across your plan are
              derived from these windows, so editing a zone updates every session.
            </p>
            <ZonesClient initialThreshold={threshold} initialZones={zones} />
          </div>
        </section>

        <section className="border border-fog rounded-[14px] bg-paper overflow-hidden">
          <div className="px-[18px] py-[14px] border-b border-fog">
            <span className="font-mono text-[12px] tracking-[.14em] uppercase text-stone">Strava</span>
          </div>
          <div className="px-[18px] py-[18px]">
            <SettingsClient
              connected={!!strava?.athlete_name}
              athleteName={strava?.athlete_name ?? null}
              lastSyncedAt={strava?.last_synced_at ?? null}
            />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
