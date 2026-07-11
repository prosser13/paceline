export const dynamic = 'force-dynamic';

import { readFile } from 'fs/promises';
import path from 'path';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { FitnessChart, CardTitle, type WeekDay } from '@/components/dashboard-graphics';
import { getRaceGuide } from '@/data/races';
import { getViewedUser } from '@/lib/impersonation';
import { getPlanBySlug, listPlanWeeks } from '@/data/plans';
import { getPredictedRaceTime } from '@/data/benchmarks';
import { getRaceKit } from '@/data/race-kit';
import { buildPacing, formatTargetTime } from '@/data/races/pacing';
import { listPlannedTssBetween, listRunningDoneForPlan, listSessionDistancesForPlan } from '@/data/plan-sessions';
import { weekRunKm } from '@/lib/weekly-volume';
import { parseGpx, type ParsedGpx } from '@/lib/gpx';
import { RACE_PRIORITY_COLOR } from '@/lib/colors';
import { getRaceForecast } from '@/lib/weather';
import { getWellnessCached } from '@/lib/intervals';
import { projectFitness, readinessFromProjection } from '@/lib/fitness-projection';
import { predictableDistanceM } from '@/lib/prediction';
import { getPredictedAtRace, listLongRunsSince } from '@/data/benchmarks';
import { getFuelPlanForGoalBlock } from '@/data/fuel-plan';
import { listCompletedForSessions } from '@/data/plan-sessions';
import { todayISO } from '@/lib/dates';
import TargetTrajectoryAsync from '@/app/(app)/_dashboard/TargetTrajectoryAsync';

import RouteMap from './RouteMap';
import ElevationProfile from './ElevationProfile';
import WeatherPanel from './WeatherPanel';
import PacingTable from './PacingTable';
import FuelPlan, { type FuelStop, type FuelReadiness } from './FuelPlan';
import CoachNotes from './CoachNotes';
import KitChecklist from './KitChecklist';
import ReadinessChart from './ReadinessChart';
import RaceResult from './RaceResult';
import RaceWeather from './RaceWeather';
import RaceAnalysis from './RaceAnalysis';
import RaceResults from './RaceResults';
import RaceNoteCard from './RaceNoteCard';
import { getRaceSessionBySlug, getCompletedForSession } from '@/data/plan-sessions';
import { getRaceAnalysis } from '@/data/race-analyses';
import { getRaceResult } from '@/data/race-results';
import { getRaceNote } from '@/data/race-notes';

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function fmtHMS(secs: number | null): string | null {
  if (secs == null) return null;
  const s = Math.round(secs);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
// decimal min/km → "m:ss"
function fmtPace(minKm: number | null): string | null {
  if (minKm == null) return null;
  const total = Math.round(minKm * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
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

  const [plan, viewer] = await Promise.all([getPlanBySlug(slug), getViewedUser()]);

  // Whether this race is the viewed user's (same ownerEmails tag as the races list).
  // Uses the EFFECTIVE viewer so an owner viewing as another athlete sees THAT
  // athlete's ownership — their own race renders in full, others are blanked. When it
  // isn't the viewer's ("Other races"), the athlete-specific plan is blanked —
  // target/pace, goal-tier times, coach notes, pacing splits, and the fuel table
  // show placeholder dashes; course info, weather, and the viewer's own readiness
  // stay. Kit stays editable and saves to the viewer (race_kit is per-user).
  const viewerEmail = viewer?.email?.toLowerCase() ?? null;
  const owned = !!viewerEmail && (guide.ownerEmails ?? []).some(e => e.toLowerCase() === viewerEmail);

  const raceDate = plan?.race_date ?? guide.date ?? null;
  const distanceKm = plan?.distance_km ?? guide.distanceKm;
  const todayStr = todayISO();

  // Explicit goal: a target set on the plan/guide (a goal-tier fallback only when
  // targets aren't hidden). When there's none, fall back to the athlete's PREDICTED
  // time for this distance from current fitness, and label it "Predicted".
  const explicitTime = plan?.target_time ?? guide.targetTime ?? (guide.hideTargets ? null : guide.goalTiers[0]?.time ?? null);
  const explicitPace = plan?.target_pace ?? guide.targetPace ?? null;
  const predicted = owned && !explicitTime ? await getPredictedRaceTime(distanceKm, todayStr) : null;
  const isPredicted = !explicitTime && !!predicted;
  const targetTime = explicitTime ?? predicted?.timeStr ?? null;
  const targetPace = explicitPace ?? predicted?.pacePerKm ?? null;

  // Goal tiers stay blank for a non-owner or a hideTargets race (per the plan's
  // "no goals for now"); the predicted time still drives the header + pacing.
  const blankGoalTiers = !owned || !!guide.hideTargets;
  const blankPacing = !owned || !targetTime;

  const [parsed, forecast, wellness, plannedTss, planWeeks, runningDone, plannedSessions, kitOverride] = await Promise.all([
    loadGpx(guide.gpxPath),
    raceDate ? getRaceForecast(guide.start.lat, guide.start.lng, raceDate) : Promise.resolve(null),
    getWellnessCached(),
    raceDate && raceDate >= todayStr
      ? listPlannedTssBetween(todayStr, raceDate)
      : Promise.resolve([]),
    plan ? listPlanWeeks(plan.id) : Promise.resolve([]),
    plan ? listRunningDoneForPlan(plan.id) : Promise.resolve([]),
    plan ? listSessionDistancesForPlan(plan.id) : Promise.resolve([]),
    getRaceKit(slug),
  ]);

  // The athlete's edited kit (if any) fully replaces the guide's curated lists.
  const kit = kitOverride ?? {
    wear: guide.kitWear, carry: guide.kitCarry, dropBag: guide.kitDropBag, nightBefore: guide.nightBefore,
  };

  // Weekly running-volume bars: actual done km for past/current weeks, planned
  // for upcoming weeks — the build → taper shape into race day.
  const raceKm = plan?.distance_km ?? guide.distanceKm;
  const weekBars: WeekDay[] = planWeeks.map(w => {
    const doneKm = runningDone
      .filter(d => d.date >= w.date_from && d.date <= w.date_to)
      .reduce((s, d) => s + d.km, 0);
    // Planned target derived from the week's run sessions — not a stored rollup —
    // so it always matches what the plan actually prescribes.
    const plannedKm = weekRunKm(plannedSessions.filter(s => s.scheduled_date >= w.date_from && s.scheduled_date <= w.date_to));
    const isPast = w.date_to < todayStr;
    const isCurrent = w.date_from <= todayStr && todayStr <= w.date_to;
    const state: WeekDay['state'] = isCurrent ? 'today' : isPast ? 'done' : 'plan';
    // Past weeks show what was actually run; current/future show the target.
    const km = isPast ? doneKm : plannedKm;
    // Highlight the race distance within its week's bar.
    const isRaceWeek = !!raceDate && w.date_from <= raceDate && raceDate <= w.date_to;
    return {
      label: `${w.week_number}`,
      km: Math.round(km),
      state,
      ...(isRaceWeek && km > 0 ? { raceKm } : {}),
    };
  });
  // Fitness/fatigue projection across the plan, up to race day.
  //  • Plan already underway → seed from real intervals.icu values and show the
  //    history-then-projection from today.
  //  • Plan not started yet → project the whole plan from an assumed start
  //    (fitness 50 / form 50), swapped for real data once day 1 lands.
  const seed = wellness.form;
  const daysToGo = raceDate ? daysUntil(raceDate) : null;
  // Past race → post-race mode: lead with the result, tuck prep into a reference accordion.
  const isPast = daysToGo != null && daysToGo < 0;

  // Two prediction gates (§7A):
  //  • Pre-race TRAJECTORY card is the marathon campaign scoreboard — goal-marathon
  //    pages only (a target + block only mean something there).
  //  • Post-race PREDICTED-VS-ACTUAL derives at the race's actual distance from the
  //    fitness VDOT, so it covers any road distance (incl. odd tune-ups); the ultra
  //    is excluded (VDOT doesn't model 50 mi).
  const isMarathonRace = predictableDistanceM(distanceKm) === 42195;
  const bannerDistanceM = distanceKm != null && distanceKm >= 3 && distanceKm <= 45
    ? Math.round(distanceKm * 1000) : null;
  let actualFinishSecs: number | null = null;

  // Post-race extras (coach analysis, full results, notes) + the completion actuals
  // for the header stats and the flat-equivalent estimate.
  let post: { analysis: Awaited<ReturnType<typeof getRaceAnalysis>>; result: Awaited<ReturnType<typeof getRaceResult>>; note: string; canAnalyse: boolean } | null = null;
  let actual: { time: string | null; pace: string | null; distanceKm: number | null; avgHr: number | null } | null = null;
  let flat: { ngp: string | null; rule: string | null } | null = null;
  let raceDurationMins: number | null = null;
  if (isPast) {
    const rs = await getRaceSessionBySlug(slug);
    const [analysis, result, note, row] = await Promise.all([
      getRaceAnalysis(slug), getRaceResult(slug), getRaceNote(slug),
      rs ? getCompletedForSession(rs.id) : Promise.resolve(null),
    ]);
    post = { analysis, result, note, canAnalyse: !!row };
    if (row) {
      const secs = row.actual_duration_secs != null ? Number(row.actual_duration_secs)
        : row.actual_duration_mins != null ? Number(row.actual_duration_mins) * 60 : null;
      actualFinishSecs = secs;
      const dist = row.actual_distance_km != null ? Number(row.actual_distance_km) : null;
      const ngpMinKm = row.actual_ngp_min_km != null ? Number(row.actual_ngp_min_km) : null;
      actual = {
        time: fmtHMS(secs),
        pace: fmtPace(row.actual_avg_pace_min_km != null ? Number(row.actual_avg_pace_min_km) : null),
        distanceKm: dist, avgHr: row.actual_avg_hr != null ? Number(row.actual_avg_hr) : null,
      };
      // Flat-equivalent finish: (a) grade-adjusted from the run's NGP, (b) a simple
      // rule (~0.5 s per metre of ascent). Both shown to compare.
      const ngpTime = ngpMinKm != null && dist != null ? fmtHMS(ngpMinKm * 60 * dist) : null;
      const ruleTime = secs != null && guide.ascentM ? fmtHMS(secs - guide.ascentM * 0.5) : null;
      flat = (ngpTime || ruleTime) ? { ngp: ngpTime, rule: ruleTime } : null;
      if (secs != null) raceDurationMins = Math.round(secs / 60);
    }
  }
  // Post-race predicted-vs-actual: how did the finish compare to the prediction we
  // carried into the race (the latest snapshot on/before race day)? Marathon-only
  // today; hides gracefully when no snapshot pre-dates the race.
  let predictedVsActual: { predicted: number; actual: number } | null = null;
  if (isPast && bannerDistanceM != null && raceDate && actualFinishSecs != null) {
    const predictedAtRace = await getPredictedAtRace(raceDate, bannerDistanceM);
    if (predictedAtRace != null) predictedVsActual = { predicted: predictedAtRace, actual: actualFinishSecs };
  }

  // Fall back to the target time for the weather window if there's no actual yet.
  if (raceDurationMins == null && targetTime) {
    const tp = String(targetTime).split(':').map(Number);
    raceDurationMins = tp.length === 3 ? tp[0] * 60 + tp[1] + Math.round(tp[2] / 60) : tp[0] * 60 + (tp[1] ?? 0);
  }
  const planStart = planWeeks[0]?.date_from ?? null;
  const planStarted = planStart ? todayStr >= planStart : true;

  let projection: ReturnType<typeof projectFitness> | null = null;
  let projectionHistory = wellness.history;
  let readinessStartLabel = 'today';
  let assumedNote: string | null = null;

  if (raceDate && raceDate >= todayStr && plannedTss.length > 0) {
    if (planStarted && seed) {
      projection = projectFitness({ fitness: seed.fitness, fatigue: seed.fatigue }, plannedTss, todayStr, raceDate);
    } else if (planStart) {
      projection = projectFitness({ fitness: 50, fatigue: 50 }, plannedTss, planStart, raceDate);
      projectionHistory = null;
      readinessStartLabel = 'plan start';
      const startLabel = new Date(planStart + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      assumedNote = `Assumed start: fitness 50 · fatigue 50 — replaced by real data when the plan begins (${startLabel}).`;
    }
  }
  const readiness = projection ? readinessFromProjection(projection) : null;

  // Pacing rows need a target to distribute time; when there's none, build with a
  // placeholder purely to get the checkpoint rows, then blank the paces at render.
  const pacing = buildPacing(guide, targetTime ?? '1:00:00');
  const targetTimeDisplay = targetTime ? formatTargetTime(targetTime) : '—';

  // Fuel rehearsal readiness — for endurance races (≥30 km), compare logged
  // long-run fuelling (last 16 weeks) against the plan's carb target, plus
  // adherence to the gut-training progression (on-plan reps so far). Derived only.
  let fuelReadiness: FuelReadiness | null = null;
  if ((distanceKm ?? 0) >= 30) {
    const fuelTarget = guide.fuel.carbsPerHourG?.[1] ?? null;
    if (fuelTarget != null && fuelTarget > 0) {
      const since = new Date(new Date(todayStr + 'T00:00:00Z').getTime() - 112 * 86400000).toISOString().slice(0, 10);
      const [longRuns, fuelMap] = await Promise.all([
        listLongRunsSince(since),
        getFuelPlanForGoalBlock(todayStr),
      ]);
      if (longRuns.length > 0) {
        const logged = longRuns.filter(r => r.fuelCarbsPerH != null).map(r => r.fuelCarbsPerH as number);
        // Progression adherence: past gut-training reps, completed + logged within
        // 8 g/h of that rep's target.
        const pastReps = [...fuelMap.entries()].filter(([, t]) => t.kind === 'progression');
        let repsCompleted = 0, repsOnPlan = 0;
        if (pastReps.length) {
          const completions = await listCompletedForSessions(pastReps.map(([id]) => id));
          const byId = new Map(completions.map(c => [c.plan_session_id as string, c]));
          for (const [id, t] of pastReps) {
            const c = byId.get(id);
            if (!c) continue;
            repsCompleted++;
            const g = c.fuel_carbs_per_h != null ? Number(c.fuel_carbs_per_h) : null;
            if (g != null && t.gph != null && g >= t.gph - 8) repsOnPlan++;
          }
        }
        fuelReadiness = {
          targetGPerH: fuelTarget,
          avgGPerH: logged.length ? Math.round(logged.reduce((a, b) => a + b, 0) / logged.length) : null,
          bestGPerH: logged.length ? Math.round(Math.max(...logged)) : null,
          practiced: logged.length,
          totalLongRuns: longRuns.length,
          repsCompleted,
          repsOnPlan,
        };
      }
    }
  }

  // Checkpoint-by-checkpoint fuelling plan: zip the curated fuel notes with the
  // pacing arrival times. Skip the start row (no fuel note).
  const fuelSchedule: FuelStop[] = guide.checkpoints
    .map((c, i) => ({
      name: c.name,
      distanceKm: c.distanceKm,
      time: pacing[i].arrival,
      between: c.fuelBetween ?? '',
      atStop: c.fuelAt ?? '',
      dropBag: !!c.dropBag,
    }))
    .filter(s => s.between || s.atStop);

  // Fluid target flexes with the race-day forecast (null until ~16 days out).
  let fluidRange: [number, number] = guide.fuel.fluidPerHourMl;
  let fluidNote: string | null = null;
  if (forecast) {
    const high = forecast.high;
    if (high >= 22) { fluidRange = [600, 800]; fluidNote = `Raised for a warm forecast (${high}°C high) — drink to thirst and keep sodium up.`; }
    else if (high >= 18) { fluidRange = [500, 700]; fluidNote = `Nudged up for the ${high}°C forecast.`; }
    else if (high <= 12) { fluidRange = [350, 500]; fluidNote = `Cool forecast (${high}°C) — the lower end is plenty.`; }
    else { fluidNote = `Forecast ${high}°C — base intake is about right.`; }
  }

  const raceDateLong = raceDate
    ? new Date(raceDate + 'T00:00:00').toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : null;
  const raceDateShort = raceDate
    ? new Date(raceDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : null;

  return (
    <>
      <div className="px-4 md:px-[26px] py-[22px] max-w-[1040px]">
        {/* breadcrumb */}
        <Link href="/races" className="font-mono text-[12px] text-stone hover:text-ink active:opacity-70 transition-colors">
          ← Races
        </Link>

        {/* hero header */}
        <div className="rounded-[18px] overflow-hidden border border-fog mt-[10px]">
          <div className="px-[22px] py-[20px] flex items-start justify-between gap-6" style={{ background: RACE_PRIORITY_COLOR[guide.priority] ?? RACE_PRIORITY_COLOR.A }}>
            <div>
              <span className="font-mono text-[12px] tracking-[.16em] uppercase text-bone/80">{guide.priority}-Race · {isPast ? 'Result' : 'Guide'}</span>
              <h1 className="font-display font-extrabold text-[30px] text-bone leading-[1.05] mt-[2px]">{guide.eventName}</h1>
              <p className="text-[13px] text-bone/85 mt-[5px]">{guide.region}{raceDateLong ? ` · ${raceDateLong}` : ''}</p>
            </div>
            {daysToGo != null && daysToGo >= 0 && (
              <div className="text-right shrink-0">
                <div className="font-display font-extrabold text-[44px] leading-none text-bone">{daysToGo}</div>
                <div className="font-mono text-[12px] tracking-[.1em] uppercase text-bone/80">days to go</div>
              </div>
            )}
          </div>
          <div className="bg-paper grid grid-cols-2 sm:grid-cols-4 divide-x divide-fog">
            {(isPast && actual
              ? [
                  { label: 'Distance', value: actual.distanceKm != null ? `${actual.distanceKm.toFixed(2)} km` : `${distanceKm ?? guide.distanceKm} km` },
                  { label: 'Ascent', value: guide.ascentM ? `${guide.ascentM} m` : 'Flat' },
                  { label: 'Finish', value: actual.time ?? '—' },
                  { label: 'Pace', value: actual.pace ? `${actual.pace}/km` : '—' },
                ]
              : [
                  { label: 'Distance', value: `${distanceKm ?? guide.distanceKm} km` },
                  { label: 'Ascent', value: guide.ascentM ? `${guide.ascentM} m` : 'Flat' },
                  { label: isPredicted ? 'Predicted' : 'Target', value: owned && targetTime ? targetTimeDisplay : '—' },
                  { label: isPredicted ? 'Predicted pace' : 'Pace', value: owned && targetPace ? `${targetPace}/km` : '—' },
                ]
            ).map(({ label, value }) => (
              <div key={label} className="px-[16px] py-[13px]">
                <div className="font-mono text-[11px] tracking-[.06em] uppercase text-stone">{label}</div>
                <div className="font-display font-bold text-[20px] mt-[4px]">{value}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[15px] text-ink leading-relaxed mt-[18px]">{guide.summary}</p>

        {/* Post-race: the result + per-km splits lead, then weather, coach, results, notes. */}
        {isPast && post && (
          <div className="mt-[24px] flex flex-col gap-[24px]">
            {predictedVsActual && (() => {
              const diff = predictedVsActual.actual - predictedVsActual.predicted;   // <0 = beat prediction
              const beat = diff <= 0;
              return (
                <div className="border border-fog rounded-[14px] bg-paper px-[18px] py-[14px]">
                  <div className="text-[11px] uppercase font-bold text-race mb-[6px]" style={{ letterSpacing: '.07em' }}>Predicted vs actual</div>
                  <div className="flex flex-wrap items-baseline gap-x-[16px] gap-y-[4px]">
                    <span className="text-[14px] text-ink">predicted <b className="font-display text-[19px]">{fmtHMS(predictedVsActual.predicted)}</b></span>
                    <span className="text-[14px] text-ink">ran <b className="font-display text-[19px]">{fmtHMS(predictedVsActual.actual)}</b></span>
                    <span className="font-bold text-[14px]" style={{ color: beat ? 'var(--color-ready)' : 'var(--color-run)' }}>
                      {beat ? '−' : '+'}{fmtHMS(Math.abs(diff))} {beat ? 'faster than predicted' : 'slower than predicted'}
                    </span>
                  </div>
                  <div className="text-[11px] text-stone mt-[6px]">Prediction carried into race day, from the fitness trend across the block.</div>
                </div>
              );
            })()}
            <RaceResult slug={slug} />
            {flat && (
              <div className="border border-fog rounded-[14px] bg-paper px-[18px] py-[14px] -mt-[12px]">
                <div className="text-[11px] uppercase font-bold text-stone mb-[6px]" style={{ letterSpacing: '.07em' }}>Flat-equivalent finish</div>
                <div className="flex flex-wrap items-baseline gap-x-[16px] gap-y-[4px]">
                  {flat.ngp && (
                    <span className="text-[15px] text-ink">≈<b className="font-display text-[18px]">{flat.ngp}</b> <span className="text-[12px] text-stone">grade-adjusted (your run’s elevation)</span></span>
                  )}
                  {flat.rule && (
                    <span className="text-[15px] text-ink">≈<b className="font-display text-[18px]">{flat.rule}</b> <span className="text-[12px] text-stone">rule of thumb (~0.5 s / m climbed)</span></span>
                  )}
                </div>
                <div className="text-[11px] text-stone mt-[6px]">What this time might be worth on a pancake-flat course. Two methods for now — we’ll refine once we see how they compare.</div>
              </div>
            )}
            <RaceWeather
              slug={slug}
              lat={guide.start.lat}
              lng={guide.start.lng}
              dateISO={raceDate}
              startTime={guide.startTime}
              durationMins={raceDurationMins}
              seasonal={guide.seasonalWeather}
              raceDateLabel={raceDateShort}
            />
            <RaceAnalysis slug={slug} analysis={post.analysis} canAnalyse={post.canAnalyse} />
            <RaceResults slug={slug} result={post.result} />
            <RaceNoteCard slug={slug} raceDate={raceDate} initialNote={post.note} />
          </div>
        )}

        {/* ── Course ── */}
        <div className="grid lg:grid-cols-2 gap-[14px] mt-[24px]">
          <RouteMap title="Course" parsed={parsed} checkpoints={guide.checkpoints} totalKm={guide.distanceKm} />
          <div className="flex flex-col gap-[14px]">
            <ElevationProfile title="Elevation" ascentM={guide.ascentM} parsed={parsed} checkpoints={guide.checkpoints} totalKm={guide.distanceKm} />
            <div className="border border-fog rounded-[14px] bg-paper px-[18px] py-[15px]">
              <CardTitle>Terrain</CardTitle>
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

        {/* Pre-race sections render inline; post-race they collapse into a
            "Race prep (reference)" accordion — available, not the headline. */}
        <details open={!isPast} className="mt-[24px] group">
          <summary className={isPast
            ? 'cursor-pointer list-none [&::-webkit-details-marker]:hidden text-[11px] uppercase font-bold text-stone hover:text-ink transition-colors'
            : 'hidden'} style={{ letterSpacing: '.07em' }}>
            Race prep · reference
            <span className="inline-block ml-[6px] group-open:rotate-90 transition-transform">▸</span>
          </summary>

        {/* Predicted finish trajectory — the campaign scoreboard, stacked above the
            fitness/form readiness (§6C). Marathon-only today; streams independently.
            FUTURE (multi-distance): a distance-parameterised loader replaces this. */}
        {!isPast && isMarathonRace && (
          <div className="mt-[24px]">
            <Suspense fallback={null}>
              <TargetTrajectoryAsync />
            </Suspense>
          </div>
        )}

        {/* ── Targets & readiness ── */}
        <div className="grid lg:grid-cols-2 gap-[14px] mt-[24px]">
          <div className="border border-fog rounded-[14px] bg-paper overflow-hidden flex flex-col h-full">
            <div className="px-[18px] pt-[15px]"><CardTitle>Goal tiers</CardTitle></div>
            <div className="flex flex-col flex-1 divide-y divide-fog border-t border-fog">
              {guide.goalTiers.map(t => (
                <div key={t.label} className="flex flex-1 items-center gap-[14px] px-[18px] py-[14px]">
                  <span className="font-display font-bold text-[20px] text-oxblood w-[20px]">{t.label}</span>
                  <span className="font-display font-bold text-[20px] text-ink w-[68px] tabular-nums">{blankGoalTiers ? '—' : formatTargetTime(t.time)}</span>
                  <span className="text-[13px] text-stone leading-snug">{blankGoalTiers ? '' : t.note}</span>
                </div>
              ))}
            </div>
          </div>
          {projection && readiness ? (
            <ReadinessChart
              history={projectionHistory}
              projection={projection}
              readiness={readiness}
              daysToGo={daysToGo}
              startLabel={readinessStartLabel}
              assumedNote={assumedNote}
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

        {/* titles now live inside each card (top-left); sections just need spacing */}
        <div className="mt-[24px]">
          <WeatherPanel forecast={forecast} seasonal={guide.seasonalWeather} raceDateLabel={raceDateShort} />
        </div>
        <div className="mt-[24px]">
          <CoachNotes notes={owned ? guide.coachNotes : []} />
        </div>
        <div className="mt-[24px]">
          <PacingTable
            rows={blankPacing ? pacing.map(r => ({ ...r, legPace: null, cumElapsed: '—', arrival: '—' })) : pacing}
            targetTime={blankPacing ? '—' : targetTimeDisplay}
            note={owned ? guide.pacingNote : null}
          />
        </div>
        <div className="mt-[24px]">
          <FuelPlan fuel={guide.fuel} schedule={fuelSchedule} fluidRange={fluidRange} fluidNote={fluidNote} readiness={owned ? fuelReadiness : null} locked={!owned} />
        </div>
        <div className="mt-[24px]">
          <KitChecklist
            slug={guide.slug}
            intro={guide.kitNote}
            wear={kit.wear}
            carry={kit.carry}
            dropBag={kit.dropBag}
            nightBefore={kit.nightBefore}
          />
        </div>

        {/* weekly running volume across the plan — build → taper → race */}
        {weekBars.length > 0 && (() => {
          const maxKm = Math.max(...weekBars.map(w => w.km), 1);
          return (
              <div className="border border-fog rounded-[14px] bg-paper mt-[24px]" style={{ padding: '14px 16px' }}>
                <CardTitle>Weekly running volume</CardTitle>
                <div className="flex items-end gap-[8px]" style={{ height: '54px' }}>
                  {weekBars.map((w, i) => {
                    const isRace = (w.raceKm ?? 0) > 0;
                    const h = w.km <= 0 ? 4 : Math.max(6, Math.round((w.km / maxKm) * 50));
                    return (
                      <div key={i} className="flex-1 rounded-[3px]"
                        style={{ height: `${h}px`, background: isRace ? 'var(--color-race)' : 'var(--color-run)', opacity: isRace || w.state === 'today' ? 1 : 0.5, ...(w.state === 'today' ? { outline: '2px solid var(--color-hero)', outlineOffset: '1px' } : {}) }} />
                    );
                  })}
                </div>
                <div className="flex gap-[8px] mt-[5px]">
                  {weekBars.map((w, i) => {
                    const isRace = (w.raceKm ?? 0) > 0;
                    return (
                      <span key={i} className="flex-1 text-center text-[9px] font-bold"
                        style={{ color: isRace ? 'var(--color-race)' : w.state === 'today' ? 'var(--color-strength)' : 'var(--color-stone)' }}>
                        {w.state === 'today' ? `${w.label}·now` : isRace ? 'race' : w.label === '1' ? 'W1' : w.label}
                      </span>
                    );
                  })}
                </div>
              </div>
          );
        })()}
        </details>
      </div>
    </>
  );
}
