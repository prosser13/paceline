// Derivations for the wellness tiles: rolling baselines and the flag/nudge logic
// over `wellness_days`. Pure and dependency-free (except the row type) so it's
// unit-testable and the tiles stay presentational. All thresholds are named
// constants here so they can be tuned as more history accrues.
//
// Baselines exclude the latest day (today) and need a minimum number of valid
// days before a flag fires — until then a tile shows a "building baseline" state.

import type { WellnessDay } from '@/data/wellness-days';

// ── tunable thresholds ────────────────────────────────────────
export const BODY = {
  window: 28,        // days of history the baseline is drawn from
  minDays: 5,        // valid days required before RHR/HRV flags fire
  rhrAmberZ: 1.0,    // resting HR this many SD above baseline → amber
  rhrRedZ: 2.0,      //            "                   red
  rhrRedAbs: 5,      // …or this many bpm above baseline → red regardless of SD
  hrvAmberZ: -1.0,   // HRV this many SD below baseline → amber
  hrvRedZ: -2.0,     //            "               red
  hrvStrongZ: 1.0,   // HRV this many SD above baseline → "well recovered"
};
export const SLEEP = {
  targetSecs: 28800, // 8h nightly target
  shortNight: 25200, // < 7h last night → nudge
  weakAvg: 27000,    // 7-night avg < 7.5h → nudge
  goodScore: 85,
  nights: 7,
};
export const STANDOUTS = { window: 30, max: 3 };

export type Flag = 'good' | 'watch' | 'alert' | 'neutral';

// ── primitive stats ───────────────────────────────────────────
export const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

export function stddev(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map(x => (x - m) ** 2)));
}

export function zScore(x: number, mu: number, sigma: number): number {
  return sigma > 0 ? (x - mu) / sigma : 0;
}

type NumKey = 'resting_hr' | 'hrv' | 'sleep_secs' | 'sleep_score' | 'vo2max' | 'steps' | 'ctl' | 'atl';

// Non-null values of `key` with their dates, in the given order.
function series(days: WellnessDay[], key: NumKey): { date: string; v: number }[] {
  return days
    .map(d => ({ date: d.date, v: d[key] as number | null }))
    .filter((r): r is { date: string; v: number } => r.v != null && !Number.isNaN(r.v));
}

export interface Baseline { mu: number; sigma: number; n: number; ready: boolean }

// Baseline for `key` over up to `window` days, from `history` (caller passes the
// day list WITHOUT today so the current value is judged against its own past).
export function baseline(history: WellnessDay[], key: NumKey, window = BODY.window, minDays = BODY.minDays): Baseline {
  const vs = series(history, key).slice(-window).map(r => r.v);
  return { mu: mean(vs), sigma: stddev(vs), n: vs.length, ready: vs.length >= minDays };
}

export interface Extreme { value: number; date: string; days: number }

// The min/max of `key` across the last `window` days, with how many days it leads.
export function extremeInWindow(days: WellnessDay[], key: NumKey, dir: 'min' | 'max', window = STANDOUTS.window): Extreme | null {
  const s = series(days, key).slice(-window);
  if (!s.length) return null;
  let best = s[0];
  for (const r of s) if (dir === 'max' ? r.v > best.v : r.v < best.v) best = r;
  return { value: best.v, date: best.date, days: s.length };
}

const round = (x: number): number => Math.round(x);
const latestOf = (days: WellnessDay[]): WellnessDay | null => days.length ? days[days.length - 1] : null;

// ── Body Signals: RHR + HRV vs baseline (illness / overreach flag) ──
export interface Marker { value: number | null; base: number | null; delta: number | null; z: number | null; tone: Flag }
export interface BodySignals {
  ready: boolean;                // enough history to judge
  status: Flag;                  // overall
  headline: string;              // e.g. "Recovery normal"
  line: string;                  // the sentence
  rhr: Marker;
  hrv: Marker;
  baselineDays: number;
}

const emptyMarker = (value: number | null): Marker => ({ value, base: null, delta: null, z: null, tone: 'neutral' });

export function bodySignals(days: WellnessDay[]): BodySignals {
  const latest = latestOf(days);
  const history = days.slice(0, -1);
  const rhrBase = baseline(history, 'resting_hr');
  const hrvBase = baseline(history, 'hrv');
  const rhrToday = latest?.resting_hr ?? null;
  const hrvToday = latest?.hrv ?? null;

  const ready = rhrBase.ready && hrvBase.ready && (rhrToday != null || hrvToday != null);
  if (!ready) {
    return {
      ready: false, status: 'neutral', headline: 'Building baseline',
      line: `Learning your normal range — ${Math.max(rhrBase.n, hrvBase.n)} of ${BODY.minDays} days so far.`,
      rhr: emptyMarker(rhrToday), hrv: emptyMarker(hrvToday),
      baselineDays: Math.max(rhrBase.n, hrvBase.n),
    };
  }

  // Resting HR — higher is worse.
  let rhr: Marker = emptyMarker(rhrToday);
  if (rhrToday != null && rhrBase.ready) {
    const z = zScore(rhrToday, rhrBase.mu, rhrBase.sigma);
    const overAbs = rhrToday - rhrBase.mu;
    const tone: Flag = (z >= BODY.rhrRedZ || overAbs >= BODY.rhrRedAbs) ? 'alert' : z >= BODY.rhrAmberZ ? 'watch' : 'good';
    rhr = { value: rhrToday, base: round(rhrBase.mu), delta: round(overAbs), z, tone };
  }

  // HRV — lower is worse.
  let hrv: Marker = emptyMarker(hrvToday);
  if (hrvToday != null && hrvBase.ready) {
    const z = zScore(hrvToday, hrvBase.mu, hrvBase.sigma);
    const tone: Flag = z <= BODY.hrvRedZ ? 'alert' : z <= BODY.hrvAmberZ ? 'watch' : 'good';
    hrv = { value: hrvToday, base: round(hrvBase.mu), delta: round(hrvToday - hrvBase.mu), z, tone };
  }

  const anyAlert = rhr.tone === 'alert' || hrv.tone === 'alert';
  const anyWatch = rhr.tone === 'watch' || hrv.tone === 'watch';
  const strong = (hrv.z ?? 0) >= BODY.hrvStrongZ && (rhr.z ?? 1) <= 0;

  let status: Flag; let headline: string; let line: string;
  if (anyAlert) {
    status = 'alert'; headline = 'Worth watching';
    line = 'Resting HR up and/or HRV suppressed — a classic early sign of illness or deep fatigue. Ease off today and watch for symptoms.';
  } else if (anyWatch) {
    status = 'watch'; headline = 'Keep an eye out';
    const which = rhr.tone === 'watch' ? 'Resting HR' : 'HRV';
    line = `${which} is drifting off your baseline. Not alarming yet — worth a lighter touch if it continues.`;
  } else if (strong) {
    status = 'good'; headline = 'Well recovered';
    line = 'HRV above baseline and resting HR low — your body is soaking up the training.';
  } else {
    status = 'good'; headline = 'Recovery normal';
    line = 'Resting HR and HRV both sit within your usual range — nothing flagging today.';
  }

  return { ready: true, status, headline, line, rhr, hrv, baselineDays: Math.max(rhrBase.n, hrvBase.n) };
}

// ── Sleep: last night + 7-night trend + debt nudge ──
export interface SleepNight { date: string; secs: number | null; score: number | null; hit: boolean }
export interface SleepSummary {
  lastSecs: number | null; lastScore: number | null; lastDate: string | null;
  nights: SleepNight[];        // most recent `SLEEP.nights`, ascending
  avgSecs: number | null;      // mean of nights with data
  balanceSecs: number | null;  // Σ(secs − target) over nights with data (+ = surplus)
  target: number;
  tone: Flag;                  // good | watch
  nudge: string;
}

export function sleepSummary(days: WellnessDay[], target = SLEEP.targetSecs): SleepSummary {
  const withSleep = days.filter(d => d.sleep_secs != null);
  const last = withSleep.length ? withSleep[withSleep.length - 1] : null;
  const recent = days.slice(-SLEEP.nights);
  const nights: SleepNight[] = recent.map(d => ({
    date: d.date, secs: d.sleep_secs, score: d.sleep_score,
    hit: d.sleep_secs != null && d.sleep_secs >= target,
  }));
  const secsVals = nights.map(n => n.secs).filter((v): v is number => v != null);
  const avgSecs = secsVals.length ? mean(secsVals) : null;
  const balanceSecs = secsVals.length ? secsVals.reduce((a, s) => a + (s - target), 0) : null;

  let tone: Flag = 'neutral'; let nudge = 'Not enough nights logged yet.';
  if (avgSecs != null && last?.sleep_secs != null) {
    const shortLast = last.sleep_secs < SLEEP.shortNight;
    const weakAvg = avgSecs < SLEEP.weakAvg;
    if (shortLast || weakAvg) {
      tone = 'watch';
      const deficitH = balanceSecs != null && balanceSecs < 0 ? Math.round((-balanceSecs / 3600) * 10) / 10 : null;
      nudge = deficitH
        ? `Down ~${deficitH}h against target this week — bank an early night.`
        : 'A short night — try to get to bed earlier tonight.';
    } else {
      tone = 'good';
      const avgH = Math.round((avgSecs / 3600) * 10) / 10;
      nudge = `On point — averaging ${avgH}h a night.`;
    }
  }

  return {
    lastSecs: last?.sleep_secs ?? null, lastScore: last?.sleep_score ?? null, lastDate: last?.date ?? null,
    nights, avgSecs, balanceSecs, target, tone, nudge,
  };
}

// ── Standouts: notable recent numbers, positive-leaning ──
export interface Standout { key: string; icon: 'up' | 'down' | 'star'; text: string; value: string; tone: Flag }

export function standouts(days: WellnessDay[]): Standout[] {
  const w = days.slice(-STANDOUTS.window);
  const latest = latestOf(days);
  const out: Standout[] = [];
  const near = (a?: string | null, b?: string | null) => !!a && !!b && a === b; // extreme is today's

  const bestSleep = extremeInWindow(w, 'sleep_score', 'max');
  if (bestSleep && bestSleep.days >= 3) {
    out.push({ key: 'sleep', icon: 'star', tone: 'good', value: `${round(bestSleep.value)}`,
      text: `Best sleep score in ${bestSleep.days} days` });
  }
  const lowRhr = extremeInWindow(w, 'resting_hr', 'min');
  if (lowRhr && lowRhr.days >= 3) {
    out.push({ key: 'rhr', icon: 'down', tone: 'good', value: `${round(lowRhr.value)}`,
      text: `Resting HR at a ${lowRhr.days}-day low` });
  }
  const highHrv = extremeInWindow(w, 'hrv', 'max');
  if (highHrv && highHrv.days >= 3) {
    out.push({ key: 'hrv', icon: 'up', tone: 'good', value: `${round(highHrv.value)}`,
      text: `HRV peaked over the last ${highHrv.days} days` });
  }
  const vo2 = series(w, 'vo2max');
  if (vo2.length) {
    const cur = vo2[vo2.length - 1].v;
    const prev = vo2.length > 1 ? vo2[0].v : cur;
    if (cur > prev) out.push({ key: 'vo2', icon: 'up', tone: 'good', value: `${round(cur)}`, text: `VO₂max up to ${round(cur)}` });
    else out.push({ key: 'vo2', icon: 'star', tone: 'neutral', value: `${round(cur)}`, text: `VO₂max holding at ${round(cur)}` });
  }
  const longSleep = extremeInWindow(w, 'sleep_secs', 'max');
  if (longSleep && longSleep.days >= 3 && latest && near(longSleep.date, latest.date)) {
    out.push({ key: 'longsleep', icon: 'up', tone: 'good', value: `${Math.round(longSleep.value / 3600 * 10) / 10}h`,
      text: `Longest sleep in ${longSleep.days} days` });
  }

  // De-dupe by key, keep positive ones first, cap at STANDOUTS.max.
  const seen = new Set<string>();
  return out
    .filter(s => (seen.has(s.key) ? false : (seen.add(s.key), true)))
    .sort((a, b) => (a.tone === 'good' ? 0 : 1) - (b.tone === 'good' ? 0 : 1))
    .slice(0, STANDOUTS.max);
}

// ── Recovery Trend: HRV + RHR trajectory vs baseline (grid tile) ──
export interface TrendSeries { values: (number | null)[]; latest: number | null; base: number | null; tone: Flag }
export interface RecoveryTrend { hrv: TrendSeries; rhr: TrendSeries; status: Flag; headline: string; days: number }

export function recoveryTrend(days: WellnessDay[], window = 14): RecoveryTrend {
  const recent = days.slice(-window);
  const history = days.slice(0, -1);
  const hrvBase = baseline(history, 'hrv');
  const rhrBase = baseline(history, 'resting_hr');
  const bs = bodySignals(days); // reuse today's flag for tones + status, keeping the two tiles consistent
  return {
    hrv: { values: recent.map(d => d.hrv), latest: bs.hrv.value, base: hrvBase.ready ? round(hrvBase.mu) : null, tone: bs.hrv.tone },
    rhr: { values: recent.map(d => d.resting_hr), latest: bs.rhr.value, base: rhrBase.ready ? round(rhrBase.mu) : null, tone: bs.rhr.tone },
    status: bs.status,
    headline: !bs.ready ? 'Building baseline' : bs.status === 'good' ? 'Trending steady' : bs.headline,
    days: recent.length,
  };
}

// ── Recovery adjustment for the Readiness tile ──
export interface RecoveryAdjustment { delta: number; reason: string; sleepAdj: number; hrvAdj: number }

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export function recoveryAdjustment(days: WellnessDay[]): RecoveryAdjustment {
  const latest = latestOf(days);
  const history = days.slice(0, -1);
  const hrvBase = baseline(history, 'hrv');
  const score = latest?.sleep_score ?? null;
  const hrv = latest?.hrv ?? null;

  const sleepAdj = score != null ? clamp((score - 80) / 4, -5, 5) : 0;   // 92 → +3, 60 → −5
  const hrvAdj = hrv != null && hrvBase.ready ? clamp(zScore(hrv, hrvBase.mu, hrvBase.sigma) * 3, -5, 5) : 0;
  const delta = Math.round(clamp(sleepAdj + hrvAdj, -10, 10));

  let reason = 'Recovery neutral — score unchanged.';
  if (delta > 0) reason = Math.abs(sleepAdj) >= Math.abs(hrvAdj) ? 'Good sleep nudged it up.' : 'HRV above baseline nudged it up.';
  else if (delta < 0) reason = Math.abs(hrvAdj) >= Math.abs(sleepAdj) ? 'HRV below baseline eased it down.' : 'Short sleep eased it down.';
  return { delta, reason, sleepAdj: Math.round(sleepAdj), hrvAdj: Math.round(hrvAdj) };
}
