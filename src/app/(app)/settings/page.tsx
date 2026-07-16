export const dynamic = 'force-dynamic';
import { getStravaConnectionSummary } from '@/data/strava-connection';
import { getUserIntegrations } from '@/data/user-integrations';
import { listRacePlans } from '@/data/plans';
import {
  getThresholdPace, listPaceZones, getHrConfig, listHrZones,
  getPowerConfig, listPowerZones, getBikeHrConfig, listBikeHrZones,
  getSwimConfig, listSwimPaceZones,
} from '@/data/zones';
import { listPlanConstraints, getCoachingPrefs, coachUpdatesLockedForCurrentUser, type Autonomy } from '@/data/coaching';
import { getWeatherConfig } from '@/data/weather-config';
import { getSweatSodium, getGutCapMl } from '@/data/hydration';
import { getLatestThresholdCheck, getPendingThresholdSuggestion, listThresholdChecks, getRevertableChange } from '@/data/threshold-suggestion';
import { getLatestPowerCheck, getPendingPowerSuggestion, listPowerChecks, getRevertablePowerChange } from '@/data/power-suggestion';
import PowerSuggestion from '../benchmarks/PowerSuggestion';
import { getProgressionMode } from '@/data/strength-progression';
import { listPlanPrefs } from '@/data/plans';
import { listAdjustments } from '@/data/plan-mutations';
import SettingsClient from './SettingsClient';
import StrengthProgressionClient from './StrengthProgressionClient';
import ZonesClient from './ZonesClient';
import HrZonesClient from './HrZonesClient';
import PowerZonesClient from './PowerZonesClient';
import SwimZonesClient from './SwimZonesClient';
import TargetTimesClient, { type TargetTimeRow } from './TargetTimesClient';
import PlanPrefsClient from './PlanPrefsClient';
import ConstraintsClient from './ConstraintsClient';
import CoachingClient from './CoachingClient';
import TrainingLocationClient from './TrainingLocationClient';
import HydrationConfigClient from './HydrationConfigClient';
import IntegrationsClient from './IntegrationsClient';
import ChangeLogClient from './ChangeLogClient';
import SignOutClient from './SignOutClient';
import ViewAsCard from './ViewAsCard';
import McpClient from './McpClient';
import { getViewer } from '@/lib/auth';
import { getImpersonatedUserId, listImpersonatableUsers } from '@/lib/impersonation';
import { getMcpTokenInfo } from '@/data/mcp-tokens';
import {
  saveBikeHrZones,
  type ZoneInput, type HrZoneInput, type PowerZoneInput, type SwimZoneInput, type ConstraintInput,
} from './actions';

export default async function SettingsPage() {
  const [
    strava, thresholdPace, paceZones, hrConfig, hrZones,
    powerConfig, powerZones, bikeHrConfig, bikeHrZones, racePlans,
    constraints, coachingPrefs, planPrefs, adjustments, progressionMode, weatherConfig, sweatSodium, gutCapMl,
    thrLatest, thrPending, thrHistory, thrRevertable, integrations,
    swimConfig, swimZones,
    pwrLatest, pwrPending, pwrHistory, pwrRevertable,
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
    getProgressionMode(),
    getWeatherConfig(),
    getSweatSodium(),
    getGutCapMl(),
    getLatestThresholdCheck(),
    getPendingThresholdSuggestion(),
    listThresholdChecks(10),
    getRevertableChange(),
    getUserIntegrations(),
    getSwimConfig(),
    listSwimPaceZones(),
    getLatestPowerCheck(),
    getPendingPowerSuggestion(),
    listPowerChecks(10),
    getRevertablePowerChange(),
  ]);

  // "View as" is owner-only. getViewer reflects the REAL session identity (not the
  // impersonated one), so an owner still sees the picker while viewing as someone.
  const viewer = await getViewer();
  const [viewAsUsers, viewingAsId] = viewer?.role === 'owner'
    ? await Promise.all([listImpersonatableUsers(viewer.user.id), getImpersonatedUserId()])
    : [[], null];

  const mcpToken = await getMcpTokenInfo();

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

  // Swim: sec/100m → "m:ss" for the inputs.
  const secToMss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const swimCss  = swimConfig?.css_sec_per_100 != null ? secToMss(swimConfig.css_sec_per_100) : '';
  const swimPool = swimConfig?.pool_size_m != null ? String(swimConfig.pool_size_m) : '25';
  const swimZoneInputs: SwimZoneInput[] = swimZones.map(z => ({
    name:     z.name,
    pace_min: secToMss(z.pace_min_sec),
    pace_max: secToMss(z.pace_max_sec),
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
  const morningBriefing = coachingPrefs?.morning_briefing ?? true;
  const morningFallback = (coachingPrefs?.morning_fallback_time as string | undefined) ?? '09:30';
  const morningSkipRest = coachingPrefs?.morning_skip_rest ?? false;
  const coachLocked = await coachUpdatesLockedForCurrentUser();
  // Locked accounts read as off and can't turn it on; everyone else uses their pref.
  const coachUpdates = coachLocked ? false : (coachingPrefs?.coach_updates_enabled ?? true);

  return (
    <>
      <div className="px-4 md:px-[26px] py-[22px] max-w-[760px]">
        <h1 className="font-display font-bold text-[26px] mb-5">Settings</h1>

        <SettingsCard cat="Coaching" color="var(--color-strength)" title="Autonomy"
          subtitle="How much latitude the coach has when it adapts your plan, and the guardrails it must stay within. Changes are picked up on the next coaching review.">
          <CoachingClient
            initialAutonomy={coachAutonomy}
            initialMaxRamp={coachMaxRamp}
            initialMinRest={coachMinRest}
            initialProtectA={coachProtectA}
            initialNotes={coachNotes}
            initialMorningBriefing={morningBriefing}
            initialMorningFallback={morningFallback}
            initialMorningSkipRest={morningSkipRest}
            initialCoachUpdates={coachUpdates}
            coachLocked={coachLocked}
          />
        </SettingsCard>

        <SettingsCard cat="Coaching" color="var(--color-strength)" title="Constraints"
          subtitle="Hard limits the coach must respect — recurring days off, travel blackouts, or a free-text rule it should always work around.">
          <ConstraintsClient initialConstraints={constraintInputs} />
        </SettingsCard>

        <SettingsCard cat="Training" color="var(--color-hard)" title="Training location"
          subtitle="Where you train, so the dashboard can heat-adjust today's run pace from the local forecast.">
          <TrainingLocationClient
            initialHomeLabel={(weatherConfig?.home_label as string | null) ?? null}
            initialDefaultHour={weatherConfig?.default_hour ?? 7}
            initialOverrideLabel={(weatherConfig?.override_label as string | null) ?? null}
          />
        </SettingsCard>

        <SettingsCard cat="Training" color="var(--color-hard)" title="Hydration"
          subtitle="Your sweat-sodium concentration from a sweat test — sets the sodium side of the fluid-loss estimates on your benchmarks and race plans.">
          <HydrationConfigClient initialSweatSodium={sweatSodium} initialGutCap={gutCapMl} />
        </SettingsCard>

        <SettingsCard cat="Coaching" color="var(--color-strength)" title="Change log"
          subtitle="Every change the coach (or you) makes to the plan, newest first — what changed, when, and why. Revert to undo one.">
          <ChangeLogClient entries={adjustments} />
        </SettingsCard>

        <SettingsCard cat="Strength" color="var(--color-strength)" title="Progression"
          subtitle="How the strength builder adapts as you get stronger. Hybrid grows upper-body work for tone while holding leg loads for injury-proofing; progressive climbs everything; maintenance holds throughout.">
          <StrengthProgressionClient initialMode={progressionMode} />
        </SettingsCard>

        <SettingsCard cat="Plan" color="var(--color-race)" title="Target times"
          subtitle="Goal finish time for each A-race. Target pace is derived from the time and distance, and drives the goal-pace segments in that plan's sessions.">
          {targetTimePlans.length
            ? <TargetTimesClient plans={targetTimePlans} />
            : <p className="text-[14px] text-stone/70">No races yet.</p>}
        </SettingsCard>

        <SettingsCard cat="Plan" color="var(--color-race)" title="Strength priority"
          subtitle="How a day with both a run and a lift is ordered — strength first leads with the lift (ultra/strength blocks); run first puts the run ahead.">
          {planPrefs.length
            ? <PlanPrefsClient plans={planPrefs} />
            : <p className="text-[14px] text-stone/70">No plans yet.</p>}
        </SettingsCard>

        <SettingsCard cat="Running" color="var(--color-run)" title="Pace zones"
          subtitle="Planned runs are built from zones — the paces across your plan derive from these windows, so editing a zone updates every session.">
          <ZonesClient initialThreshold={threshold} initialZones={zones}
            thresholdCheck={{ latest: thrLatest, pending: thrPending, history: thrHistory, revertable: thrRevertable }} />
        </SettingsCard>

        <SettingsCard cat="Running" color="var(--color-run)" title="Heart-rate zones"
          subtitle="Your running heart-rate threshold, max and resting values, plus zone ranges in bpm.">
          <HrZonesClient
            initialThreshold={hrThreshold}
            initialMax={hrMax}
            initialResting={hrResting}
            initialZones={hrZoneInputs}
          />
        </SettingsCard>

        <SettingsCard cat="Cycling" color="var(--color-ride)" title="Power zones"
          subtitle="Your cycling threshold power (FTP) and zone ranges in watts. Rides are built from these zones, so editing one updates every ride's targets.">
          <PowerZonesClient initialThreshold={powerThreshold} initialZones={powerZoneInputs} />
          <PowerSuggestion latest={pwrLatest} pending={pwrPending} history={pwrHistory} revertable={pwrRevertable} />
        </SettingsCard>

        <SettingsCard cat="Cycling" color="var(--color-ride)" title="Bike heart-rate zones"
          subtitle="Cycling heart rate runs lower than running, so it has its own threshold, max and resting values plus zone ranges in bpm.">
          <HrZonesClient
            initialThreshold={bikeHrThreshold}
            initialMax={bikeHrMax}
            initialResting={bikeHrResting}
            initialZones={bikeHrZoneInputs}
            save={saveBikeHrZones}
          />
        </SettingsCard>

        <SettingsCard cat="Swimming" color="var(--color-swim)" title="Swim pace zones"
          subtitle="Your Critical Swim Speed (CSS) threshold and pace zones in min:sec per 100 m, plus your default pool size. Swims are built from these zones and pushed to the watch with the pool length.">
          <SwimZonesClient initialCss={swimCss} initialPool={swimPool} initialZones={swimZoneInputs} />
        </SettingsCard>

        <SettingsCard cat="Connections" color="var(--color-yoga)" title="Strava" subtitle={null}>
          <SettingsClient
            connected={!!strava?.athlete_name}
            athleteName={strava?.athlete_name ?? null}
            lastSyncedAt={strava?.last_synced_at ?? null}
          />
        </SettingsCard>

        <SettingsCard cat="Connections" color="var(--color-yoga)" title="intervals.icu & Telegram"
          subtitle="Your intervals.icu athlete id + API key (wellness/fitness sync and optional Garmin workout push) and the Telegram chat that receives your coach messages.">
          <IntegrationsClient
            initialIntervalsAthleteId={integrations?.intervals_athlete_id ?? ''}
            initialTelegramChatId={integrations?.telegram_chat_id ?? ''}
            initialWorkoutSync={integrations?.intervals_workout_sync ?? false}
            hasApiKey={!!integrations?.intervals_api_key}
          />
        </SettingsCard>

        {viewAsUsers.length > 0 && (
          <SettingsCard cat="Account" color="var(--color-stone)" title="View as"
            subtitle="See the app as another athlete sees it — their dashboard, plan and coach messages — without their login. Read-only: you can look but not change their data. A banner and exit stay on screen while you're viewing.">
            <ViewAsCard users={viewAsUsers} activeId={viewingAsId} />
          </SettingsCard>
        )}

        <SettingsCard cat="Account" color="var(--color-stone)" title="Claude (MCP)"
          subtitle="Connect Claude to your paceline data with a read-only MCP connector — query your plan, sessions, zones, races and recent workouts. Each token is yours alone.">
          <McpClient
            initialExists={mcpToken.exists}
            initialCanWrite={mcpToken.canWrite}
            createdAt={mcpToken.createdAt}
            lastUsedAt={mcpToken.lastUsedAt}
          />
        </SettingsCard>

        <SettingsCard cat="Account" color="var(--color-stone)" title="Session"
          subtitle="Sign out of this device." last>
          <SignOutClient />
        </SettingsCard>
      </div>
    </>
  );
}

// Settings card — coloured category eyebrow + Lora title + subtitle, matching the
// settings mockup.
function SettingsCard({ cat, color, title, subtitle, children, last = false }: {
  cat: string; color: string; title: string; subtitle?: string | null; children: React.ReactNode; last?: boolean;
}) {
  return (
    <section className={`border border-fog rounded-[14px] bg-paper ${last ? '' : 'mb-[14px]'}`} style={{ padding: '16px 18px' }}>
      <div className="text-[11px] uppercase font-bold" style={{ letterSpacing: '.07em', color }}>{cat}</div>
      <div className="font-display font-bold text-[17px] mt-[1px]">{title}</div>
      {subtitle && <div className="text-[12px] font-medium text-stone mt-[2px] mb-[14px]">{subtitle}</div>}
      {!subtitle && <div className="mb-[10px]" />}
      {children}
    </section>
  );
}
