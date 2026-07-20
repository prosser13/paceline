// Derivations for the wellness tiles: rolling baselines and the flag/nudge logic
// over `wellness_days`. Pure and dependency-free (except the row type) so it's
// unit-testable and the tiles stay presentational. All thresholds are named
// constants here so they can be tuned as more history accrues.
//
// Baselines exclude the latest day (today) and need a minimum number of valid
// days before a flag fires — until then a tile shows a "building baseline" state.

import type { WellnessDay } from '@/data/wellness-days';
import { fmtSleep, daysBetween, toDate } from '@/lib/dates';

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
export const STANDOUTS = {
  recentDays: 2,          // last 3 days: today, yesterday, 2 days ago (n = 0,1,2)
  lookback: 21,           // window a "best in N days" is judged against
  max: 4,
  sleepGoodScore: 85,     // a "good" night, for the streak
  sleepBestFloor: 90,     // quality floor: a "best sleep" standout must clear this
  hrvHighZ: 1.0,          // HRV must be ≥ this many SD above baseline to be "high"
  rhrLowZ: -1.0,          // RHR must be ≤ this many SD below baseline to be "low"
  stepsMilestone: 20000,  // a "big movement day"
  streakMin: 3,           // min consecutive good-sleep nights to surface
  weeklyPbMinWeeks: 3,    // need this many weeks of history to call a volume PB
  weeklyIncreasePct: 0.15,
};

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
export function extremeInWindow(days: WellnessDay[], key: NumKey, dir: 'min' | 'max', window = STANDOUTS.lookback): Extreme | null {
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

  // Either metric being ready is enough — a device that never reports HRV (or RHR)
  // shouldn't leave the whole tile stuck on "Building baseline" forever. Each metric
  // below is rendered only when its own baseline is ready.
  const rhrReady = rhrBase.ready && rhrToday != null;
  const hrvReady = hrvBase.ready && hrvToday != null;
  const ready = rhrReady || hrvReady;
  if (!ready) {
    const days = Math.min(BODY.minDays, Math.max(rhrBase.n, hrvBase.n));
    return {
      ready: false, status: 'neutral', headline: 'Building baseline',
      line: `Learning your normal range — ${days} of ${BODY.minDays} days so far.`,
      rhr: emptyMarker(rhrToday), hrv: emptyMarker(hrvToday),
      baselineDays: days,
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

  // `last` is the most recent day WITH sleep data, which can be several days old if
  // the watch didn't sync. Only treat it as "last night" (for the short-night nudge)
  // when it's within a day of the newest day in the window.
  const asOfDate = days.length ? days[days.length - 1].date : null;
  const lastIsRecent = last != null && asOfDate != null &&
    (Date.parse(asOfDate) - Date.parse(last.date)) / 86_400_000 <= 1.5;

  let tone: Flag = 'neutral'; let nudge = 'Lack of recent data — wear your watch.';
  if (avgSecs != null && last?.sleep_secs != null) {
    const shortLast = lastIsRecent && last.sleep_secs < SLEEP.shortNight;
    const weakAvg = avgSecs < SLEEP.weakAvg;
    if (shortLast || weakAvg) {
      tone = 'watch';
      const deficitH = balanceSecs != null && balanceSecs < 0 ? Math.round((-balanceSecs / 3600) * 10) / 10 : null;
      const lastH = Math.round((last.sleep_secs / 3600) * 10) / 10;
      nudge = shortLast
        ? `Short night (${lastH}h) — early night.`
        : deficitH != null ? `Down ~${deficitH}h this week — early night.` : 'Down on sleep this week — early night.';
    } else {
      tone = 'good';
      const avgH = Math.round((avgSecs / 3600) * 10) / 10;
      nudge = `Well rested — averaging ${avgH}h`;
    }
  }

  return {
    lastSecs: last?.sleep_secs ?? null, lastScore: last?.sleep_score ?? null, lastDate: last?.date ?? null,
    nights, avgSecs, balanceSecs, target, tone, nudge,
  };
}

// ── Sleep cue: one-line, race-aware steer for the dashboard console ──
// Reuses sleepSummary's tone/debt read and layers a race-week nudge on top. The
// athlete knows which race is coming, so it says "race day", not the name. First
// match wins. Kept terse to fit the console tile.
export const RACE_SLEEP_DAYS = 5;   // within this many nights of a race → race-week cues

export function sleepCue(sleep: SleepSummary, ctx: { daysToRace: number | null; hrvTone?: Flag }): string {
  const ready = sleep.avgSecs != null && sleep.lastSecs != null;
  if (!ready) return 'Lack of recent data — wear your watch.';                                   // 8

  const n = ctx.daysToRace;
  const racingSoon = n != null && n >= 0 && n <= RACE_SLEEP_DAYS;
  const deficitH = sleep.balanceSecs != null && sleep.balanceSecs < 0
    ? Math.round((-sleep.balanceSecs / 3600) * 10) / 10 : null;
  const lastH = sleep.lastSecs != null ? Math.round((sleep.lastSecs / 3600) * 10) / 10 : null;
  const avgH = sleep.avgSecs != null ? Math.round((sleep.avgSecs / 3600) * 10) / 10 : null;
  const behind = sleep.tone === 'watch';
  const shortLast = sleep.lastSecs != null && sleep.lastSecs < SLEEP.shortNight;

  if (racingSoon) {
    if (n! <= 1) return 'Race tomorrow — early night, aim 8h+.';                                 // 1
    if (behind && deficitH != null) return `~${deficitH}h down with race day in ${n} nights — early night.`; // 2
    return `Bank sleep — ${n} nights to race day. Hold 8h+.`;                                    // 3
  }

  if (behind) {
    if (shortLast && lastH != null) return `Short night (${lastH}h) — early night.`;             // 4
    if (deficitH != null) return `Down ~${deficitH}h this week — early night.`;                  // 5
    return lastH != null ? `Short night (${lastH}h) — early night.` : 'Down on sleep this week — early night.';
  }
  if (ctx.hrvTone === 'watch' || ctx.hrvTone === 'alert') return 'HRV is low — early night to recover.'; // 7
  return `Well rested — averaging ${avgH}h`;                                                     // 6
}

// ── Standouts: genuinely notable, RECENT (last 3 days), positive things ──
// Each candidate must (a) have happened within STANDOUTS.recentDays and (b) clear
// a quality bar (a real high/low vs baseline, an absolute floor, or a streak) —
// so the tile only celebrates things that are actually standout, not the mere
// window max. Training standouts (weekly volume, races) come in via StandoutInputs.
export interface Standout { key: string; icon: 'up' | 'down' | 'star' | 'flame' | 'trophy' | 'run'; text: string; value: string; tone: Flag; when?: string }

export interface StandoutWeek { weekStart: string; km: number }         // completed weeks only, ascending
export interface StandoutRace { date: string; name: string; timeSec: number; targetSec: number | null }
export interface StandoutInputs { days: WellnessDay[]; asOf: string; weekKm?: StandoutWeek[]; races?: StandoutRace[] }

function addDays(dateStr: string, n: number): string {
  const d = toDate(dateStr); d.setDate(d.getDate() + n);
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function fmtClockSec(sec: number): string {
  const s = Math.round(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
}
const kSteps = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);

export function standouts(input: StandoutInputs): Standout[] {
  const { days, asOf } = input;
  const out: Standout[] = [];
  const dAgo = (date: string) => daysBetween(date, asOf);           // asOf − date
  const isRecent = (date: string) => { const n = dAgo(date); return n >= 0 && n <= STANDOUTS.recentDays; };
  const whenText = (date: string) => { const n = dAgo(date); return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`; };
  const w = days.slice(-STANDOUTS.lookback);
  const history = days.slice(0, -1);

  // Best sleep score — a recent, genuinely high night (window best + ≥ floor).
  const bestSleep = extremeInWindow(w, 'sleep_score', 'max', STANDOUTS.lookback);
  if (bestSleep && bestSleep.days >= 3 && isRecent(bestSleep.date) && bestSleep.value >= STANDOUTS.sleepBestFloor) {
    out.push({ key: 'sleep', icon: 'star', tone: 'good', value: `${round(bestSleep.value)}`,
      text: `Best sleep score in ${bestSleep.days} days`, when: whenText(bestSleep.date) });
  }

  // Good-sleep streak (consecutive nights ending today).
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) { const sc = days[i].sleep_score; if (sc != null && sc >= STANDOUTS.sleepGoodScore) streak++; else break; }
  if (streak >= STANDOUTS.streakMin) {
    out.push({ key: 'sleepstreak', icon: 'flame', tone: 'good', value: `${streak}`, text: `${streak} good sleeps in a row`, when: 'now' });
  }

  // HRV at a recent high — must be notably above baseline, not just the max.
  const hrvBase = baseline(history, 'hrv');
  const hrvHigh = extremeInWindow(w, 'hrv', 'max', STANDOUTS.lookback);
  if (hrvHigh && hrvHigh.days >= 3 && isRecent(hrvHigh.date) && hrvBase.ready && zScore(hrvHigh.value, hrvBase.mu, hrvBase.sigma) >= STANDOUTS.hrvHighZ) {
    out.push({ key: 'hrv', icon: 'up', tone: 'good', value: `${round(hrvHigh.value)}`,
      text: `HRV at a ${hrvHigh.days}-day high`, when: whenText(hrvHigh.date) });
  }

  // Resting HR at a recent low — must be notably below baseline.
  const rhrBase = baseline(history, 'resting_hr');
  const rhrLow = extremeInWindow(w, 'resting_hr', 'min', STANDOUTS.lookback);
  if (rhrLow && rhrLow.days >= 3 && isRecent(rhrLow.date) && rhrBase.ready && zScore(rhrLow.value, rhrBase.mu, rhrBase.sigma) <= STANDOUTS.rhrLowZ) {
    out.push({ key: 'rhr', icon: 'down', tone: 'good', value: `${round(rhrLow.value)}`,
      text: `Resting HR at a ${rhrLow.days}-day low`, when: whenText(rhrLow.date) });
  }

  // VO₂max increase (a genuine standout metric) — latest reading up on the prior distinct value.
  const vo2 = series(days, 'vo2max');
  if (vo2.length >= 2) {
    const last = vo2[vo2.length - 1];
    let prev: { date: string; v: number } | null = null;
    for (let i = vo2.length - 2; i >= 0; i--) { if (vo2[i].v !== last.v) { prev = vo2[i]; break; } }
    if (prev && last.v > prev.v && isRecent(last.date)) {
      out.push({ key: 'vo2', icon: 'up', tone: 'good', value: `${round(last.v)}`, text: `VO₂max up to ${round(last.v)}`, when: whenText(last.date) });
    }
  }

  // Steps milestone — a big movement day in the recent window.
  let bigStep: { date: string; v: number } | null = null;
  for (const d of days) { if (d.steps != null && isRecent(d.date) && (!bigStep || d.steps > bigStep.v)) bigStep = { date: d.date, v: d.steps }; }
  if (bigStep && bigStep.v >= STANDOUTS.stepsMilestone) {
    out.push({ key: 'steps', icon: 'flame', tone: 'good', value: kSteps(bigStep.v), text: `Big movement day — ${kSteps(bigStep.v)} steps`, when: whenText(bigStep.date) });
  }

  // Weekly running volume — a PB or a notable jump in the week that just finished.
  const weeks = input.weekKm ?? [];
  if (weeks.length >= 2) {
    const lastW = weeks[weeks.length - 1], prevW = weeks[weeks.length - 2];
    if (isRecent(addDays(lastW.weekStart, 6))) {                    // that week ended within the recent window
      const maxKm = Math.max(...weeks.map(x => x.km));
      if (weeks.length >= STANDOUTS.weeklyPbMinWeeks && lastW.km >= maxKm) {
        out.push({ key: 'weekvol', icon: 'trophy', tone: 'good', value: `${Math.round(lastW.km)}km`, text: 'Biggest running week yet', when: 'last week' });
      } else if (prevW.km > 0 && lastW.km >= prevW.km * (1 + STANDOUTS.weeklyIncreasePct)) {
        out.push({ key: 'weekvol', icon: 'up', tone: 'good', value: `${Math.round(lastW.km)}km`, text: `Weekly volume up ${Math.round((lastW.km / prevW.km - 1) * 100)}%`, when: 'last week' });
      }
    }
  }

  // Race result — a recent race that hit or beat its target.
  for (const r of input.races ?? []) {
    if (!isRecent(r.date) || r.timeSec <= 0) continue;
    if (r.targetSec != null && r.timeSec <= r.targetSec + 2) {      // 2s grace
      const gap = Math.round(r.targetSec - r.timeSec);
      out.push({ key: 'race', icon: 'trophy', tone: 'good', value: fmtClockSec(r.timeSec),
        text: gap >= 1 ? `${r.name} — beat target by ${gap}s` : `${r.name} — hit target`, when: whenText(r.date) });
    } else if (r.targetSec == null) {
      out.push({ key: 'race', icon: 'run', tone: 'good', value: fmtClockSec(r.timeSec), text: `Raced ${r.name}`, when: whenText(r.date) });
    }
    break; // one race is plenty
  }

  const seen = new Set<string>();
  return out.filter(s => (seen.has(s.key) ? false : (seen.add(s.key), true))).slice(0, STANDOUTS.max);
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

// ── Weekly recap: this week's averages vs last week (the "This week" tile) ──
export interface WeekStat { key: string; label: string; value: string; delta: string | null; tone: Flag }
export interface WeeklyRecap { stats: WeekStat[] }

function avgOf(days: WellnessDay[], key: NumKey): number | null {
  const vs = series(days, key).map(r => r.v);
  return vs.length ? mean(vs) : null;
}

const fmtSteps = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`);

// Averages over the last 7 days vs the 7 before, with a signed delta coloured by
// whether the change is in the good direction (higherGood=null → neutral steps).
export function weeklyRecap(days: WellnessDay[]): WeeklyRecap {
  const thisWeek = days.slice(-7);
  const prevWeek = days.slice(-14, -7);

  const mk = (
    key: NumKey, label: string, fmt: (n: number) => string,
    higherGood: boolean | null, minDelta: number,
  ): WeekStat => {
    const cur = avgOf(thisWeek, key);
    if (cur == null) return { key, label, value: '—', delta: null, tone: 'neutral' };
    const prev = avgOf(prevWeek, key);
    let delta: string | null = null;
    let tone: Flag = 'neutral';
    if (prev != null) {
      const d = cur - prev;
      if (Math.abs(d) < minDelta) {
        delta = '± steady';
      } else {
        delta = `${d > 0 ? '▲' : '▼'} ${fmt(Math.abs(d))}`;
        if (higherGood != null) tone = (higherGood ? d > 0 : d < 0) ? 'good' : 'watch';
      }
    }
    return { key, label, value: fmt(cur), delta, tone };
  };

  return {
    stats: [
      mk('sleep_secs', 'Avg sleep', s => fmtSleep(s), true, 300),   // ±5 min noise floor
      mk('hrv', 'Avg HRV', v => `${Math.round(v)}`, true, 1),
      mk('resting_hr', 'Avg RHR', v => `${Math.round(v)}`, false, 1),
      mk('steps', 'Steps/day', v => fmtSteps(v), null, 500),
    ],
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
