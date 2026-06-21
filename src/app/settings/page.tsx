export const dynamic = 'force-dynamic';

import AppShell from '@/components/AppShell';
import { getStravaConnectionSummary } from '@/data/strava-connection';
import { listRacePlans } from '@/data/plans';
import { getThresholdPace, listPaceZones, getHrConfig, listHrZones } from '@/data/zones';
import SettingsClient from './SettingsClient';
import ZonesClient from './ZonesClient';
import HrZonesClient from './HrZonesClient';
import TargetTimesClient, { type TargetTimeRow } from './TargetTimesClient';
import type { ZoneInput, HrZoneInput } from './actions';

export default async function SettingsPage() {
  const [strava, thresholdPace, paceZones, hrConfig, hrZones, racePlans] = await Promise.all([
    getStravaConnectionSummary(),
    getThresholdPace(),
    listPaceZones(),
    getHrConfig(),
    listHrZones(),
    listRacePlans(),
  ]);

  const targetTimePlans: TargetTimeRow[] = racePlans.map(p => ({
    id: p.id,
    name: p.name,
    distance_km: Number(p.distance_km) || 0,
    target_time: p.target_time,
  }));

  const threshold = thresholdPace ?? '3:40';
  const zones: ZoneInput[] = paceZones.map(z => ({
    name:     z.name,
    pace_min: z.pace_min,
    pace_max: z.pace_max,
  }));

  const hrThreshold = hrConfig?.threshold_hr != null ? String(hrConfig.threshold_hr) : '';
  const hrMax       = hrConfig?.max_hr != null ? String(hrConfig.max_hr) : '';
  const hrResting   = hrConfig?.resting_hr != null ? String(hrConfig.resting_hr) : '';
  const hrZoneInputs: HrZoneInput[] = hrZones.map(z => ({
    name:   z.name,
    hr_min: String(z.hr_min),
    hr_max: String(z.hr_max),
  }));

  return (
    <AppShell>
      <div className="px-[26px] py-[22px] max-w-[720px]">
        <h1 className="font-display font-semibold text-[24px] mb-6">Settings</h1>

        <section className="border border-fog rounded-[14px] bg-paper overflow-hidden mb-5">
          <div className="px-[18px] py-[14px] border-b border-fog">
            <span className="font-mono text-[12px] tracking-[.14em] uppercase text-stone">Zone type</span>
          </div>
          <div className="px-[18px] py-[18px]">
            <p className="text-[15px] text-stone mb-4">
              Choose which zones the app uses to build and display sessions.
            </p>
            <div className="flex items-start gap-3">
              <span className="bg-oxblood text-bone border border-oxblood rounded-[8px] px-[18px] py-[9px] text-[14px] font-medium select-none">
                Pace
              </span>
              <div className="flex flex-col items-center gap-[5px]">
                <span
                  aria-disabled="true"
                  className="bg-bone border border-fog rounded-[8px] px-[18px] py-[9px] text-[14px] text-stone/40 cursor-not-allowed select-none"
                >
                  Heart rate
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[.1em] text-stone/50">coming soon</span>
              </div>
            </div>
          </div>
        </section>

        <section className="border border-fog rounded-[14px] bg-paper overflow-hidden mb-5">
          <div className="px-[18px] py-[14px] border-b border-fog">
            <span className="font-mono text-[12px] tracking-[.14em] uppercase text-stone">Target times</span>
          </div>
          <div className="px-[18px] py-[18px]">
            <p className="text-[15px] text-stone mb-4">
              Goal finish time for each A-race. The target pace is derived from the time and
              distance, and drives the goal-pace segments in that plan&apos;s sessions.
            </p>
            {targetTimePlans.length
              ? <TargetTimesClient plans={targetTimePlans} />
              : <p className="text-[14px] text-stone/70">No races yet.</p>}
          </div>
        </section>

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

        <section className="border border-fog rounded-[14px] bg-paper overflow-hidden mb-5">
          <div className="px-[18px] py-[14px] border-b border-fog">
            <span className="font-mono text-[12px] tracking-[.14em] uppercase text-stone">Heart rate zones</span>
          </div>
          <div className="px-[18px] py-[18px]">
            <p className="text-[15px] text-stone mb-4">
              Your heart-rate threshold, max and resting values, plus zone ranges in bpm.
            </p>
            <HrZonesClient
              initialThreshold={hrThreshold}
              initialMax={hrMax}
              initialResting={hrResting}
              initialZones={hrZoneInputs}
            />
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
