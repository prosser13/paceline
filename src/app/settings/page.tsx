export const dynamic = 'force-dynamic';

import AppShell from '@/components/AppShell';
import { supabaseAdmin } from '@/lib/supabase-admin';
import SettingsClient from './SettingsClient';

export default async function SettingsPage() {
  const { data: strava } = await supabaseAdmin
    .from('strava_connection')
    .select('athlete_name, connected_at, last_synced_at')
    .eq('id', 1)
    .single();

  return (
    <AppShell>
      <div className="px-[26px] py-[22px] max-w-[600px]">
        <h1 className="font-display font-semibold text-[22px] mb-6">Settings</h1>

        <section className="border border-fog rounded-[14px] bg-paper overflow-hidden">
          <div className="px-[18px] py-[14px] border-b border-fog">
            <span className="font-mono text-[10px] tracking-[.14em] uppercase text-stone">Strava</span>
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
