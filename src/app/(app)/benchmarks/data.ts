// Benchmarks page loader — the "fitness ladder" over a rolling 12-week window:
// predicted marathon time (with the signal breakdown), threshold pace, VO2max,
// cycling eFTP, resting HR, and recent race results with their implied marathon
// time. Long-run quality (decoupling / pace decay) + gear arrive in later waves.

import { getCurrentPrediction, getGoalMarathon, listRaceResultsSince, listBenchmarkSnapshotsSince, isoWeekStart } from '@/data/benchmarks';
import { getThresholdPace } from '@/data/zones';
import { listRecentWellnessDays } from '@/data/wellness-days';
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
  predictedTrend: Series[];          // seconds per week
  vo2max: { current: number | null; series: Series[] };
  eftp: { current: number | null; series: Series[] };
  restingHr: { current: number | null; series: Series[] };
  races: { date: string; name: string; distanceKm: number; seconds: number; impliedMarathonSeconds: number }[];
}

function lastNonNull(series: Series[]): number | null {
  for (let i = series.length - 1; i >= 0; i--) return series[i].v;
  return null;
}

export async function loadBenchmarksData(): Promise<BenchmarksData> {
  const asOf = new Date().toISOString().slice(0, 10);
  const since = addDays(asOf, -WINDOW_DAYS);

  const [prediction, goal, thresholdStr, snapshots, wellness, races] = await Promise.all([
    getCurrentPrediction(asOf),
    getGoalMarathon(asOf),
    getThresholdPace(),
    listBenchmarkSnapshotsSince(isoWeekStart(since)),
    listRecentWellnessDays(WINDOW_DAYS),
    listRaceResultsSince(addDays(asOf, -365)),   // races are sparse milestones — wider window
  ]);

  const seriesOf = (pick: (w: (typeof wellness)[number]) => number | null): Series[] =>
    wellness.flatMap(w => { const v = pick(w); return v != null ? [{ date: w.date, v }] : []; });

  const vo2Series = seriesOf(w => w.vo2max);
  const eftpSeries = seriesOf(w => w.cycling_eftp_w);
  const rhrSeries = seriesOf(w => w.resting_hr);

  return {
    asOf,
    raceName: goal?.name ?? null,
    raceDate: goal?.raceDate ?? null,
    targetSeconds: goal?.targetSeconds ?? null,
    predictedSeconds: prediction.predictedSeconds,
    signals: prediction.signals.map(s => ({ source: s.source, label: s.label, impliedSeconds: s.impliedMarathonSeconds })),
    thresholdMinKm: thresholdStr ? parseThresholdPace(thresholdStr) : null,
    thresholdTrend: snapshots.flatMap(s => s.threshold_min_km != null ? [{ date: s.week_start, v: Number(s.threshold_min_km) }] : []),
    predictedTrend: snapshots.flatMap(s => s.predicted_seconds != null ? [{ date: s.week_start, v: s.predicted_seconds }] : []),
    vo2max: { current: lastNonNull(vo2Series), series: vo2Series },
    eftp: { current: lastNonNull(eftpSeries), series: eftpSeries },
    restingHr: { current: lastNonNull(rhrSeries), series: rhrSeries },
    races: races
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(r => {
        const vdot = danielsVdot(r.distanceKm * 1000, r.seconds / 60);
        return { ...r, impliedMarathonSeconds: Math.round(vdotToTimeMin(vdot, 42195) * 60) };
      }),
  };
}
