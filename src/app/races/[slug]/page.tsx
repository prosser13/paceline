export const dynamic = 'force-dynamic';

import { readFile } from 'fs/promises';
import path from 'path';
import { notFound } from 'next/navigation';
import Link from 'next/link';

import AppShell from '@/components/AppShell';
import { WeeklyBars, FitnessChart, type WeekDay } from '@/components/dashboard-graphics';
import { getRaceGuide } from '@/data/races';
import { getPlanBySlug, listPlanWeeks } from '@/data/plans';
import { buildPacing } from '@/data/races/pacing';
import { listPlannedTssBetween, listRunningDoneForPlan } from '@/data/plan-sessions';
import { parseGpx, type ParsedGpx } from '@/lib/gpx';
import { getRaceForecast } from '@/lib/weather';
import { getWellnessCached } from '@/lib/intervals';
import { projectFitness, readinessFromProjection } from '@/lib/fitness-projection';

import RouteMap from './RouteMap';
import ElevationProfile from './ElevationProfile';
import WeatherPanel from './WeatherPanel';
import PacingTable from './PacingTable';
import FuelPlan from './FuelPlan';
import CoachNotes from './CoachNotes';
import KitChecklist from './KitChecklist';
import ReadinessChart from './ReadinessChart';

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

async function loadGpx(gpxPath: string | null): Promise<ParsedGpx | null> {
  if (!gpxPath) return null;
  try {
    const file = path.join(process.cwd(), 'public', gpxPath.replace(/^\//, ''));
    const xml = await readFile(file, 'utf8');
    return parseGpx(xml);
  } catch {
    return null; // file not present yet — components show a graceful placeholder
  }
}

export default async function RaceHeroPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = getRaceGuide(slug);
  if (!guide) notFound();

  const plan = await getPlanBySlug(slug);

  // Live data wins; fall back to curated guide values.
  const raceDate = plan?.race_date ?? null;
  const targetTime = plan?.target_time ?? guide.goalTiers[0].time;
  const targetPace = plan?.target_pace ?? null;
  const distanceKm = plan?.distance_km ?? null;

  const todayStr = new Date().toISOString().split('T')[0];

  const [parsed, forecast, wellness, plannedTss, planWeeks, runningDone] = await Promise.all([
    loadGpx(guide.gpxPath),
    raceDate ? getRaceForecast(guide.start.lat, guide.start.lng, raceDate) : Promise.resolve(null),
    getWellnessCached(),
    raceDate && raceDate >= todayStr
      ? listPlannedTssBetween(todayStr, raceDate)
      : Promise.resolve([]),
    plan ? listPlanWeeks(plan.id) : Promise.resolve([]),
    plan ? listRunningDoneForPlan(plan.id) : Promise.resolve([]),
  ]);

  // Weekly running-volume bars: actual done km for past/current weeks, planned
  // for upcoming weeks — the build → taper shape into race day.
  const raceKm = plan?.distance_km ?? Math.round(guide.distanceMi * 1.609);
  const weekBars: WeekDay[] = planWeeks.map(w => {
    const doneKm = runningDone
      .filter(d => d.date >= w.date_from && d.date <= w.date_to)
      .reduce((s, d) => s + d.km, 0);
    const isPast = w.date_to < todayStr;
    const isCurrent = w.date_from <= todayStr && todayStr <= w.date_to;
    const state: WeekDay['state'] = isCurrent ? 'today' : isPast ? 'done' : 'plan';
    // Past weeks show what was actually run; current/future show the target.
    const km = isPast ? doneKm : (w.planned_volume_km ?? 0);
    // Highlight the race distance within its week's bar.
    const isRaceWeek = !!raceDate && w.date_from <= raceDate && raceDate <= w.date_to;
    return {
      label: `${w.week_number}`,
      km: Math.round(km),
      state,
      ...(isRaceWeek && km > 0 ? { raceKm } : {}),
    };
  });
  const doneTotal = runningDone.reduce((s, d) => s + d.km, 0);
  const plannedTotal = planWeeks.reduce((s, w) => s + (w.planned_volume_km ?? 0), 0);

  // Project fitness/fatigue forward to race day when we have a seed (current
  // intervals.icu values) and the race is still ahead.
  const seed = wellness.form;
  const projection =
    seed && raceDate && raceDate >= todayStr
      ? projectFitness({ fitness: seed.fitness, fatigue: seed.fatigue }, plannedTss, todayStr, raceDate)
      : null;
  const readiness = projection ? readinessFromProjection(projection) : null;

  const pacing = buildPacing(guide, targetTime);
  const daysToGo = raceDate ? daysUntil(raceDate) : null;
  const raceDateLong = raceDate
    ? new Date(raceDate + 'T00:00:00').toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : null;
  const raceDateShort = raceDate
    ? new Date(raceDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : null;

  return (
    <AppShell>
      <div className="px-[26px] py-[22px] max-w-[1040px]">
        {/* breadcrumb */}
        <Link href="/races" className="font-mono text-[12px] text-stone hover:text-ink active:opacity-70 transition-colors">
          ← Races
        </Link>

        {/* hero header */}
        <div className="rounded-[18px] overflow-hidden border border-fog mt-[10px]">
          <div className="bg-oxblood px-[22px] py-[20px] flex items-start justify-between gap-6">
            <div>
              <span className="font-mono text-[12px] tracking-[.16em] uppercase text-bone/50">Race guide</span>
              <h1 className="font-display font-semibold text-[30px] text-bone leading-tight mt-[2px]">{guide.eventName}</h1>
              <p className="font-mono text-[13px] text-bone/60 mt-[5px]">{guide.region}</p>
              {raceDateLong && <p className="font-mono text-[13px] text-bone/60 mt-[2px]">{raceDateLong}</p>}
            </div>
            {daysToGo != null && daysToGo >= 0 && (
              <div className="text-right shrink-0">
                <div className="font-display font-semibold text-[44px] leading-none text-bone">{daysToGo}</div>
                <div className="font-mono text-[12px] tracking-[.1em] uppercase text-bone/50">days to go</div>
              </div>
            )}
          </div>
          <div className="bg-paper grid grid-cols-2 sm:grid-cols-4 divide-x divide-fog">
            {[
              { label: 'Distance', value: distanceKm != null ? `${distanceKm} km` : `${guide.distanceMi} mi` },
              { label: 'Ascent', value: `${guide.ascentM} m` },
              { label: 'Target time', value: targetTime },
              { label: 'Target pace', value: targetPace ? `${targetPace}/km` : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="px-[18px] py-[14px]">
                <div className="font-mono text-[12px] tracking-[.1em] uppercase text-stone">{label}</div>
                <div className="font-display font-semibold text-[20px] mt-[4px]">{value}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[15px] text-ink leading-relaxed mt-[18px] max-w-[760px]">{guide.summary}</p>

        {/* ── Course ── */}
        <SectionLabel>Course</SectionLabel>
        <div className="grid lg:grid-cols-2 gap-[14px]">
          <RouteMap parsed={parsed} checkpoints={guide.checkpoints} totalMi={guide.distanceMi} />
          <div className="flex flex-col gap-[14px]">
            <ElevationProfile parsed={parsed} checkpoints={guide.checkpoints} totalMi={guide.distanceMi} />
            <div className="border border-fog rounded-[14px] bg-paper px-[18px] py-[15px]">
              <p className="font-mono text-[10px] uppercase tracking-[.1em] text-stone mb-[8px]">Terrain</p>
              <ul className="flex flex-col gap-[5px]">
                {guide.terrain.map((t, i) => (
                  <li key={i} className="text-[13px] text-ink leading-snug flex gap-[7px]">
                    <span className="text-oxblood shrink-0">·</span>{t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* ── Targets & readiness ── */}
        <SectionLabel>Targets &amp; readiness</SectionLabel>
        <div className="grid lg:grid-cols-2 gap-[14px]">
          <div className="border border-fog rounded-[14px] bg-paper overflow-hidden">
            <div className="bg-oxblood/90 px-[18px] py-[10px]">
              <span className="font-mono text-[12px] uppercase tracking-[.14em] text-bone leading-none">Goal tiers</span>
            </div>
            <div className="divide-y divide-fog">
              {guide.goalTiers.map(t => (
                <div key={t.label} className="flex items-baseline gap-[14px] px-[18px] py-[12px]">
                  <span className="font-display font-semibold text-[18px] text-oxblood w-[20px]">{t.label}</span>
                  <span className="font-display font-semibold text-[18px] text-ink w-[64px] tabular-nums">{t.time}</span>
                  <span className="text-[13px] text-stone leading-snug">{t.note}</span>
                </div>
              ))}
            </div>
          </div>
          {projection && readiness ? (
            <ReadinessChart
              history={wellness.history}
              projection={projection}
              readiness={readiness}
              daysToGo={daysToGo}
            />
          ) : (
            // No intervals.icu seed (not connected) — fall back to the trend
            // chart, which shows its own connect prompt.
            <FitnessChart
              history={wellness.history}
              form={wellness.form?.form ?? null}
              fitness={wellness.form?.fitness ?? null}
              fatigue={wellness.form?.fatigue ?? null}
            />
          )}
        </div>

        {/* ── Weather ── */}
        <SectionLabel>Weather</SectionLabel>
        <WeatherPanel forecast={forecast} seasonal={guide.seasonalWeather} raceDateLabel={raceDateShort} />

        {/* ── Coach's notes ── */}
        <SectionLabel>Coaching</SectionLabel>
        <CoachNotes notes={guide.coachNotes} />

        {/* ── Pacing ── */}
        <SectionLabel>Pacing plan</SectionLabel>
        <PacingTable rows={pacing} targetTime={targetTime} />

        {/* ── Fuel ── */}
        <SectionLabel>Nutrition &amp; hydration</SectionLabel>
        <FuelPlan fuel={guide.fuel} />

        {/* ── Kit ── */}
        <SectionLabel>Equipment</SectionLabel>
        <KitChecklist slug={guide.slug} compulsory={guide.kitCompulsory} advisory={guide.kitAdvisory} />

        {/* weekly running volume across the plan (reuses dashboard graphic) */}
        {weekBars.length > 0 && (
          <>
            <SectionLabel>Weekly running volume</SectionLabel>
            <WeeklyBars
              headerLabel="Weekly running volume"
              days={weekBars}
              weekDoneKm={doneTotal}
              weekPlannedKm={plannedTotal}
              daysToRace={daysToGo}
              raceName={plan?.name ?? guide.eventName}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[13px] tracking-[.12em] uppercase text-stone mb-[10px] mt-[28px]">{children}</p>
  );
}
