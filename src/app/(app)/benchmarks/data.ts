// Benchmarks page loader — the "fitness ladder" over a rolling 12-week window:
// predicted marathon time (with the signal breakdown), threshold pace, running
// VDOT, resting HR, and recent race results with their implied marathon time.
// VDOT is derived from the prediction (running-specific) — we deliberately do NOT
// show Garmin's wellness VO2max, which is the athlete's *cycling* number. Cycling
// markers (eFTP) are omitted for now. Long-run quality + gear arrive in later waves.

import { getCurrentPrediction, getGoalMarathon, getExperimentalPredictions, getSwimPredictions, getPredictedRaces, getEnduranceReadiness, listRaceResultsSince, listLongRunsSince, listBenchmarkSnapshotsSince, isoWeekStart, type ExperimentalPredictionView, type SwimPredictionView, type PredictedRace } from '@/data/benchmarks';
import { getThresholdPace, getSwimConfig, listPowerZones } from '@/data/zones';
import { buildTriEstimate } from '@/data/races/tri-pacing';
import { SWANSEA_703 } from '@/data/races/swansea-703';
import { listRecentWellnessDays } from '@/data/wellness-days';
import { listFuelProducts, type FuelProduct } from '@/data/fuel';
import { getLatestThresholdCheck, getPendingThresholdSuggestion, listThresholdChecks, getRevertableChange, type ThresholdCheck, type RevertableChange } from '@/data/threshold-suggestion';
import { danielsVdot, vdotToTimeMin, enduranceMultiplier } from '@/lib/prediction';
import { parseThresholdPace } from '@/lib/run-tss';
import { todayISO } from '@/lib/dates';

const WINDOW_DAYS = 84;   // rolling 12 weeks

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface Series { date: string; v: number }

// The 70.3 finish predictor — the athlete's Swansea time projected from their live
// fitness (swim CSS, bike FTP, run threshold) over the course profile + T1/T2. This
// is the same estimate the race guide shows, surfaced as a Benchmarks tile.
export interface Tri703Leg { kind: string; name: string; estSeconds: number | null }
export interface Tri703View {
  raceName: string;
  slug: string;
  finishSeconds: number | null;   // null when any leg's fitness input is missing
  legs: Tri703Leg[];              // swim · T1 · bike · T2 · run
  missing: string[];              // which inputs are absent (for the "set X" hint)
}

export interface BenchmarksData {
  asOf: string;
  raceName: string | null;
  raceDate: string | null;
  targetSeconds: number | null;
  predictedSeconds: number | null;       // endurance-adjusted (the number of record)
  rawPredictedSeconds: number | null;    // unadjusted VDOT-equivalent
  endurance: { score: number; avgWeeklyKm: number; longestKm: number; anchorWeeklyKm: number };
  signals: { source: string; label: string; impliedSeconds: number }[];
  experimental: ExperimentalPredictionView[];   // the three alternative-model tiles + trend
  swimPredictions: SwimPredictionView[];        // 750 m / 1900 m swim projections
  tri703: Tri703View;                           // Swansea 70.3 finish predictor
  predictedRaces: PredictedRace[];              // 5k/10k/HM/marathon predictions + deltas
  thresholdMinKm: number | null;
  thresholdTrend: Series[];          // min/km per week
  thresholdDeltaSec: number | null;  // change since first tracked week, seconds/km (negative = faster)
  predictedDeltaSec: number | null;  // change in predicted marathon since first tracked week (negative = faster)
  thresholdCheck: { latest: ThresholdCheck | null; pending: ThresholdCheck | null; history: ThresholdCheck[]; revertable: RevertableChange | null };
  vdot: { current: number | null; series: Series[] };   // running VDOT (from the prediction)
  restingHr: { current: number | null; series: Series[] };
  races: { date: string; name: string; distanceKm: number; seconds: number; impliedMarathonSeconds: number }[];
  longRuns: {
    id: string; date: string; km: number; ngpMinKm: number;
    decouplingPct: number | null; paceDecayPct: number | null;
    efficiencyFactor: number | null; perceivedEffort: number | null;
    movingSecs: number | null; fuelCarbsPerH: number | null;
    fuelItems: { name: string; carbs_g: number; qty: number }[] | null;
  }[];
  // Efficiency Factor trend across the block's long runs (one point per run).
  ef: { current: number | null; first: number | null; series: Series[] };
  fuelProducts: FuelProduct[];
}

// Running VDOT implied by a marathon time (seconds), rounded to one decimal.
function vdotOfMarathon(seconds: number): number {
  return Math.round(danielsVdot(42195, seconds / 60) * 10) / 10;
}

// EF trend across the block's long runs (chronological). first/current anchor the
// delta chip; `series` (oldest→newest) feeds the trend chart.
function efTrend(longRuns: { date: string; efficiencyFactor: number | null }[]): BenchmarksData['ef'] {
  const series: Series[] = longRuns
    .filter(r => r.efficiencyFactor != null)
    .map(r => ({ date: r.date, v: r.efficiencyFactor as number }));
  return {
    first: series.length ? series[0].v : null,
    current: series.length ? series[series.length - 1].v : null,
    series,
  };
}

export async function loadBenchmarksData(): Promise<BenchmarksData> {
  const asOf = todayISO();
  const since = addDays(asOf, -WINDOW_DAYS);

  const [prediction, experimental, swimPredictions, predictedRaces, endurance, goal, thresholdStr, swimCfg, powerZones, snapshots, wellness, races, longRuns, fuelProducts, thrLatest, thrPending, thrHistory, thrRevertable] = await Promise.all([
    getCurrentPrediction(asOf),
    getExperimentalPredictions(asOf),
    getSwimPredictions(asOf),
    getPredictedRaces(asOf),
    getEnduranceReadiness(asOf),
    getGoalMarathon(asOf),
    getThresholdPace(),
    getSwimConfig(),
    listPowerZones(),
    listBenchmarkSnapshotsSince(isoWeekStart(since)),
    listRecentWellnessDays(WINDOW_DAYS),
    listRaceResultsSince(addDays(asOf, -365)),   // races are sparse milestones — wider window
    listLongRunsSince(since),                     // rolling 12-week window
    listFuelProducts(),
    getLatestThresholdCheck(),
    getPendingThresholdSuggestion(),
    listThresholdChecks(10),
    getRevertableChange(),
  ]);

  const rhrSeries: Series[] = wellness.flatMap(w => w.resting_hr != null ? [{ date: w.date, v: w.resting_hr }] : []);
  const rhrCurrent = rhrSeries.length ? rhrSeries[rhrSeries.length - 1].v : null;

  // VDOT: current from the live blend's raw fitness score (NOT the endurance-
  // adjusted time — VDOT is the speed-fitness marker); the trend prefers each
  // snapshot's stored vdot, deriving from predicted time only for legacy rows.
  const vdotSeries: Series[] = snapshots.flatMap(s =>
    s.vdot != null ? [{ date: s.week_start, v: Math.round(Number(s.vdot) * 10) / 10 }]
    : s.predicted_seconds != null ? [{ date: s.week_start, v: vdotOfMarathon(s.predicted_seconds) }] : []);
  const vdotCurrent = prediction.vdot != null ? Math.round(prediction.vdot * 10) / 10 : null;

  // Endurance-adjusted marathon headline (the number of record) + the raw ceiling.
  const marathonMult = enduranceMultiplier(42195, endurance.score);
  const adjustedPredictedSeconds = prediction.predictedSeconds != null
    ? Math.round(prediction.predictedSeconds * marathonMult) : null;

  // Delta since the first tracked week (needs ≥2 snapshots or there's no trend yet).
  const thresholdTrend: Series[] = snapshots.flatMap(s => s.threshold_min_km != null ? [{ date: s.week_start, v: Number(s.threshold_min_km) }] : []);
  const thresholdMinKm = thresholdStr ? parseThresholdPace(thresholdStr) : null;

  // 70.3 finish predictor — the athlete's Swansea time from live fitness over the
  // course profile + T1/T2 (same model as the race guide's estimated splits).
  const ftpW = (powerZones.find(z => z.zone_key === 'Z4')?.power_max as number | undefined) ?? null;
  const triEstimate = buildTriEstimate(SWANSEA_703, {
    swimCssSec: swimCfg?.css_sec_per_100 ?? null,
    ftpW,
    runThresholdMinKm: thresholdMinKm,
  });
  const tri703: Tri703View = {
    raceName: SWANSEA_703.eventName,
    slug: SWANSEA_703.slug,
    finishSeconds: triEstimate.finishSeconds,
    legs: triEstimate.rows.map(r => ({ kind: r.kind, name: r.name, estSeconds: r.estSeconds })),
    missing: triEstimate.missing,
  };
  const thresholdDeltaSec = thresholdTrend.length >= 2 && thresholdMinKm != null
    ? Math.round((thresholdMinKm - thresholdTrend[0].v) * 60) : null;
  const predSnaps = snapshots.filter(s => s.predicted_seconds != null);
  const predictedDeltaSec = predSnaps.length >= 2 && adjustedPredictedSeconds != null
    ? Math.round(adjustedPredictedSeconds - Number(predSnaps[0].predicted_seconds)) : null;

  return {
    asOf,
    raceName: goal?.name ?? null,
    raceDate: goal?.raceDate ?? null,
    targetSeconds: goal?.targetSeconds ?? null,
    predictedSeconds: adjustedPredictedSeconds,
    rawPredictedSeconds: prediction.predictedSeconds,
    endurance: { score: endurance.score, avgWeeklyKm: endurance.avgWeeklyKm, longestKm: endurance.longestKm, anchorWeeklyKm: endurance.anchorWeeklyKm },
    signals: prediction.signals.map(s => ({ source: s.source, label: s.label, impliedSeconds: s.impliedMarathonSeconds })),
    experimental,
    swimPredictions,
    tri703,
    predictedRaces,
    thresholdMinKm,
    thresholdTrend,
    thresholdDeltaSec,
    predictedDeltaSec,
    thresholdCheck: { latest: thrLatest, pending: thrPending, history: thrHistory, revertable: thrRevertable },
    vdot: { current: vdotCurrent, series: vdotSeries },
    restingHr: { current: rhrCurrent, series: rhrSeries },
    races: races
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(r => {
        const vdot = danielsVdot(r.distanceKm * 1000, r.seconds / 60);
        return { ...r, impliedMarathonSeconds: Math.round(vdotToTimeMin(vdot, 42195) * 60) };
      }),
    longRuns: [...longRuns].sort((a, b) => b.date.localeCompare(a.date)),   // most recent first
    ef: efTrend(longRuns),
    fuelProducts,
  };
}
