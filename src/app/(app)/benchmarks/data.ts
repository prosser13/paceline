// Benchmarks page loader — the "fitness ladder" over a rolling 12-week window:
// predicted marathon time (with the signal breakdown), threshold pace, running
// VDOT, resting HR, and recent race results with their implied marathon time.
// VDOT is derived from the prediction (running-specific) — we deliberately do NOT
// show Garmin's wellness VO2max, which is the athlete's *cycling* number. Cycling
// markers (eFTP) are omitted for now. Long-run quality + gear arrive in later waves.

import { getCurrentPrediction, getGoalMarathon, listRaceResultsSince, listLongRunsSince, listBenchmarkSnapshotsSince, isoWeekStart } from '@/data/benchmarks';
import { getThresholdPace } from '@/data/zones';
import { listRecentWellnessDays } from '@/data/wellness-days';
import { listFuelProducts, type FuelProduct } from '@/data/fuel';
import { getLatestThresholdCheck, getPendingThresholdSuggestion, listThresholdChecks, getRevertableChange, type ThresholdCheck, type RevertableChange } from '@/data/threshold-suggestion';
import { danielsVdot, vdotToTimeMin } from '@/lib/prediction';
import { parseThresholdPace } from '@/lib/run-tss';

const WINDOW_DAYS = 84;   // rolling 12 weeks

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface Series { date: string; v: number }

export interface BenchmarksData {
  asOf: string;
  raceName: string | null;
  raceDate: string | null;
  targetSeconds: number | null;
  predictedSeconds: number | null;
  signals: { source: string; label: string; impliedSeconds: number }[];
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
  const asOf = new Date().toISOString().slice(0, 10);
  const since = addDays(asOf, -WINDOW_DAYS);

  const [prediction, goal, thresholdStr, snapshots, wellness, races, longRuns, fuelProducts, thrLatest, thrPending, thrHistory, thrRevertable] = await Promise.all([
    getCurrentPrediction(asOf),
    getGoalMarathon(asOf),
    getThresholdPace(),
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

  // VDOT: current from the live prediction; the trend from each weekly snapshot's
  // predicted time (so it grows as snapshots accumulate).
  const vdotSeries: Series[] = snapshots.flatMap(s => s.predicted_seconds != null ? [{ date: s.week_start, v: vdotOfMarathon(s.predicted_seconds) }] : []);
  const vdotCurrent = prediction.predictedSeconds != null ? vdotOfMarathon(prediction.predictedSeconds) : null;

  // Delta since the first tracked week (needs ≥2 snapshots or there's no trend yet).
  const thresholdTrend: Series[] = snapshots.flatMap(s => s.threshold_min_km != null ? [{ date: s.week_start, v: Number(s.threshold_min_km) }] : []);
  const thresholdMinKm = thresholdStr ? parseThresholdPace(thresholdStr) : null;
  const thresholdDeltaSec = thresholdTrend.length >= 2 && thresholdMinKm != null
    ? Math.round((thresholdMinKm - thresholdTrend[0].v) * 60) : null;
  const predSnaps = snapshots.filter(s => s.predicted_seconds != null);
  const predictedDeltaSec = predSnaps.length >= 2 && prediction.predictedSeconds != null
    ? Math.round(prediction.predictedSeconds - Number(predSnaps[0].predicted_seconds)) : null;

  return {
    asOf,
    raceName: goal?.name ?? null,
    raceDate: goal?.raceDate ?? null,
    targetSeconds: goal?.targetSeconds ?? null,
    predictedSeconds: prediction.predictedSeconds,
    signals: prediction.signals.map(s => ({ source: s.source, label: s.label, impliedSeconds: s.impliedMarathonSeconds })),
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
