export const dynamic = 'force-dynamic';
import { getStravaConnectionSummary } from '@/data/strava-connection';
import { listRacePlans } from '@/data/plans';
import {
  getThresholdPace, listPaceZones, getHrConfig, listHrZones,
  getPowerConfig, listPowerZones, getBikeHrConfig, listBikeHrZones,
} from '@/data/zones';
import { listPlanConstraints, getCoachingPrefs, type Autonomy } from '@/data/coaching';
import { listPlanPrefs } from '@/data/plans';
import { listAdjustments } from '@/data/plan-mutations';
import SettingsClient from './SettingsClient';
import ZonesClient from './ZonesClient';
import HrZonesClient from './HrZonesClient';
import PowerZonesClient from './PowerZonesClient';
import TargetTimesClient, { type TargetTimeRow } from './TargetTimesClient';
import PlanPrefsClient from './PlanPrefsClient';
import ConstraintsClient from './ConstraintsClient';
import CoachingClient from './CoachingClient';
import ChangeLogClient from './ChangeLogClient';
import {
  saveBikeHrZones,
  type ZoneInput, type HrZoneInput, type PowerZoneInput, type ConstraintInput,
} from './actions';

export default async function SettingsPage() {
  const [
    strava, thresholdPace, paceZones, hrConfig, hrZones,
    powerConfig, powerZones, bikeHrConfig, bikeHrZones, racePlans,
    constraints, coachingPrefs, planPrefs, adjustments,
  ] = await Promise.all([
    getStravaConnectionSummary(),
    getThresholdPace(),
    listPaceZones(),
    getHrConfig(),
    listHrZones(),
    getPowerConfig(),
    listPowerZones(),
    getBikeHrConfig(),
    listBikeHrZones(),
    listRacePlans(),
    listPlanConstraints(),
    getCoachingPrefs(),
    listPlanPrefs(),
    listAdjustments(),
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

  const powerThreshold = powerConfig?.threshold_power != null ? String(powerConfig.threshold_power) : '';
  const powerZoneInputs: PowerZoneInput[] = powerZones.map(z => ({
    name:      z.name,
    power_min: String(z.power_min),
    power_max: String(z.power_max),
  }));

  const bikeHrThreshold = bikeHrConfig?.threshold_hr != null ? String(bikeHrConfig.threshold_hr) : '';
  const bikeHrMax       = bikeHrConfig?.max_hr != null ? String(bikeHrConfig.max_hr) : '';
  const bikeHrResting   = bikeHrConfig?.resting_hr != null ? String(bikeHrConfig.resting_hr) : '';
  const bikeHrZoneInputs: HrZoneInput[] = bikeHrZones.map(z => ({
    name:   z.name,
    hr_min: String(z.hr_min),
    hr_max: String(z.hr_max),
  }));

  const constraintInputs: ConstraintInput[] = constraints.map(c => ({
    kind:        (c.kind as ConstraintInput['kind']) ?? 'note',
    label:       c.label ?? '',
    day_of_week: c.day_of_week != null ? String(c.day_of_week) : '1',
    date_from:   c.date_from ?? '',
    date_to:     c.date_to ?? '',
  }));

  const coachAutonomy: Autonomy = (coachingPrefs?.autonomy as Autonomy) ?? 'propose';
  const coachMaxRamp  = coachingPrefs?.max_weekly_ramp_pct != null ? String(coachingPrefs.max_weekly_ramp_pct) : '10';
  const coachMinRest  = coachingPrefs?.min_rest_days != null ? String(coachingPrefs.min_rest_days) : '1';
  const coachProtectA = coachingPrefs?.protect_priority_a ?? true;
  const coachNotes    = coachingPrefs?.notes ?? '';

  return (
    <>
      <div className="px-[26px] py-[22px] max-w-[720px]">
        <h1 className="font-display font-semibold text-[24px] mb-6">Settings</h1>

        <section className="border border-fog rounded-[14px] bg-paper overflow-hidden mb-5">
          <div className="px-[18px] py-[14px] border-b border-fog">
            <span className="font-mono text-[12px] tracking-[.14em] uppercase text-stone">Zones</span>
          </div>
          <div className="px-[18px] py-[18px]">
            <p className="text-[15px] text-stone">
              Sessions are built from zones, so the targets shown across your plan are derived
              from these windows — editing a zone updates every session. Running uses
              <span className="text-ink font-medium"> pace</span> and
              <span className="text-ink font-medium"> heart-rate</span> zones; cycling uses
              <span className="text-ink font-medium"> power</span> and
              <span className="text-ink font-medium"> bike heart-rate</span> zones.
            </p>
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
            <span className="font-mono text-[12px] tracking-[.14em] uppercase text-stone">Plan · strength priority</span>
          </div>
          <div className="px-[18px] py-[18px]">
            <p className="text-[15px] text-stone mb-4">
              How a day with both a run and a lift is ordered. <span className="text-ink font-medium">Strength
              first</span> leads the day with the lift (suited to ultra/strength blocks);
              <span className="text-ink font-medium"> run first</span> puts the run ahead and the lift last.
            </p>
            {planPrefs.length
              ? <PlanPrefsClient plans={planPrefs} />
              : <p className="text-[14px] text-stone/70">No plans yet.</p>}
          </div>
        </section>

        <section className="border border-fog rounded-[14px] bg-paper overflow-hidden mb-5">
          <div className="px-[18px] py-[14px] border-b border-fog">
            <span className="font-mono text-[12px] tracking-[.14em] uppercase text-stone">Coaching · constraints</span>
          </div>
          <div className="px-[18px] py-[18px]">
            <p className="text-[15px] text-stone mb-4">
              Hard limits on when you can train. The coach reads these every time it reviews
              your plan and works around them — recurring days off, travel blackouts, or a
              free-text rule it should always respect.
            </p>
            <ConstraintsClient initialConstraints={constraintInputs} />
          </div>
        </section>

        <section className="border border-fog rounded-[14px] bg-paper overflow-hidden mb-5">
          <div className="px-[18px] py-[14px] border-b border-fog">
            <span className="font-mono text-[12px] tracking-[.14em] uppercase text-stone">Coaching · autonomy</span>
          </div>
          <div className="px-[18px] py-[18px]">
            <p className="text-[15px] text-stone mb-4">
              How much latitude the coach has when it adapts your plan, and the guardrails it
              must stay within. Changes are picked up on the next coaching review.
            </p>
            <CoachingClient
              initialAutonomy={coachAutonomy}
              initialMaxRamp={coachMaxRamp}
              initialMinRest={coachMinRest}
              initialProtectA={coachProtectA}
              initialNotes={coachNotes}
            />
          </div>
        </section>

        <section className="border border-fog rounded-[14px] bg-paper overflow-hidden mb-5">
          <div className="px-[18px] py-[14px] border-b border-fog">
            <span className="font-mono text-[12px] tracking-[.14em] uppercase text-stone">Coaching · change log</span>
          </div>
          <div className="px-[18px] py-[18px]">
            <p className="text-[15px] text-stone mb-4">
              Every change the coach (or you) makes to the plan, newest first — what changed, when,
              and why. Use <span className="text-ink font-medium">Revert</span> to undo one.
            </p>
            <ChangeLogClient entries={adjustments} />
          </div>
        </section>

        <section className="border border-fog rounded-[14px] bg-paper overflow-hidden mb-5">
          <div className="px-[18px] py-[14px] border-b border-fog">
            <span className="font-mono text-[12px] tracking-[.14em] uppercase text-stone">Running · pace zones</span>
          </div>
          <div className="px-[18px] py-[18px]">
            <p className="text-[15px] text-stone mb-4">
              Planned runs are built from zones — the paces shown across your plan are
              derived from these windows, so editing a zone updates every session.
            </p>
            <ZonesClient initialThreshold={threshold} initialZones={zones} />
          </div>
        </section>

        <section className="border border-fog rounded-[14px] bg-paper overflow-hidden mb-5">
          <div className="px-[18px] py-[14px] border-b border-fog">
            <span className="font-mono text-[12px] tracking-[.14em] uppercase text-stone">Running · heart rate zones</span>
          </div>
          <div className="px-[18px] py-[18px]">
            <p className="text-[15px] text-stone mb-4">
              Your running heart-rate threshold, max and resting values, plus zone ranges in bpm.
            </p>
            <HrZonesClient
              initialThreshold={hrThreshold}
              initialMax={hrMax}
              initialResting={hrResting}
              initialZones={hrZoneInputs}
            />
          </div>
        </section>

        <section className="border border-fog rounded-[14px] bg-paper overflow-hidden mb-5">
          <div className="px-[18px] py-[14px] border-b border-fog">
            <span className="font-mono text-[12px] tracking-[.14em] uppercase text-stone">Cycling · power zones</span>
          </div>
          <div className="px-[18px] py-[18px]">
            <p className="text-[15px] text-stone mb-4">
              Your cycling threshold power (FTP) and zone ranges in watts. Rides are built from
              these zones, so editing one updates every ride&apos;s power targets.
            </p>
            <PowerZonesClient initialThreshold={powerThreshold} initialZones={powerZoneInputs} />
          </div>
        </section>

        <section className="border border-fog rounded-[14px] bg-paper overflow-hidden mb-5">
          <div className="px-[18px] py-[14px] border-b border-fog">
            <span className="font-mono text-[12px] tracking-[.14em] uppercase text-stone">Cycling · heart rate zones</span>
          </div>
          <div className="px-[18px] py-[18px]">
            <p className="text-[15px] text-stone mb-4">
              Cycling heart rate runs lower than running, so it has its own threshold, max and
              resting values plus zone ranges in bpm.
            </p>
            <HrZonesClient
              initialThreshold={bikeHrThreshold}
              initialMax={bikeHrMax}
              initialResting={bikeHrResting}
              initialZones={bikeHrZoneInputs}
              save={saveBikeHrZones}
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
    </>
  );
}
