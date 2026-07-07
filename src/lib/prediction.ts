// Marathon-time prediction — the engine behind the dashboard "target trajectory"
// card and the Benchmarks predicted-time trend.
//
// It blends up to three signals into one predicted marathon finish, weighting the
// freshest and most reliable highest (per the agreed design):
//   1. Recent race results   — actual performances, highest reliability.
//   2. Threshold pace         — the athlete's configured lactate-threshold pace,
//                               treated as a ~60-minute race effort.
//   3. Long-run NGP           — grade-adjusted easy long-run pace, the softest
//                               signal (converted to an implied marathon pace).
//
// Race + threshold signals are turned into a predicted marathon time via Daniels'
// VDOT equations, which are continuous fits (not lookup tables) and so extrapolate
// smoothly to sub-2:40 paces where tabulated VDOT charts run out. The long-run
// signal is easy running, not a race, so it is NOT run through VDOT — that would
// wildly over-predict; instead it maps easy pace → implied marathon pace directly.

const MARATHON_M = 42195;

// ── Daniels' VDOT model ───────────────────────────────────────
// Oxygen cost of running at velocity v (m/min), in ml/kg/min.
function vo2Cost(vMetresPerMin: number): number {
  return -4.60 + 0.182258 * vMetresPerMin + 0.000104 * vMetresPerMin * vMetresPerMin;
}

// Fraction of VO2max sustainable for a race lasting t minutes (Daniels' drop-off).
function pctVo2max(tMin: number): number {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin);
}

// VDOT (a fitness score ~ VO2max) implied by covering `distanceM` in `timeMin`.
export function danielsVdot(distanceM: number, timeMin: number): number {
  if (distanceM <= 0 || timeMin <= 0) return 0;
  const v = distanceM / timeMin;                 // m/min
  return vo2Cost(v) / pctVo2max(timeMin);
}

// Invert the model: the time (minutes) to cover `distanceM` at a given VDOT.
// Solved by bisection — the relationship is monotonic in time, so this converges
// quickly and needs no tuned tables.
export function vdotToTimeMin(vdot: number, distanceM: number): number {
  if (vdot <= 0 || distanceM <= 0) return 0;
  let lo = distanceM / 400;    // absurdly fast bound (~400 m/min ≈ 2:30/km)
  let hi = distanceM / 60;     // absurdly slow bound (~60 m/min ≈ 16:40/km)
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    // VDOT rises as time falls; solve danielsVdot(distanceM, mid) == vdot.
    if (danielsVdot(distanceM, mid) > vdot) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// A single input performance and its predicted marathon time (seconds).
export interface PredictionSignal {
  source: 'race' | 'threshold' | 'long_run';
  label: string;                 // e.g. "10K 33:40 · 21 Jun"
  date: string | null;           // ISO date the signal is dated to (for recency)
  impliedMarathonSeconds: number;
  weight: number;                // final blend weight (base reliability × recency)
}

export interface MarathonPrediction {
  predictedSeconds: number | null;
  signals: PredictionSignal[];   // every signal that contributed, weight-sorted
}

// ── signal → implied marathon time ────────────────────────────

// A race result: VDOT from the actual performance, projected to 42.195 km.
function raceSignal(distanceM: number, timeSeconds: number, date: string | null, label: string): PredictionSignal | null {
  if (!(distanceM > 0) || !(timeSeconds > 0)) return null;
  const vdot = danielsVdot(distanceM, timeSeconds / 60);
  if (!(vdot > 0)) return null;
  return {
    source: 'race', label, date,
    impliedMarathonSeconds: Math.round(vdotToTimeMin(vdot, MARATHON_M) * 60),
    weight: 0,
  };
}

// Threshold pace (min/km) treated as a ~60-minute race effort, then VDOT-projected.
const THRESHOLD_RACE_MIN = 60;
function thresholdSignal(thresholdMinKm: number, date: string | null): PredictionSignal | null {
  if (!(thresholdMinKm > 0)) return null;
  const distanceM = (THRESHOLD_RACE_MIN / thresholdMinKm) * 1000;   // distance covered in 60 min
  const vdot = danielsVdot(distanceM, THRESHOLD_RACE_MIN);
  if (!(vdot > 0)) return null;
  return {
    source: 'threshold', label: `Threshold ${fmtPace(thresholdMinKm)}/km`, date,
    impliedMarathonSeconds: Math.round(vdotToTimeMin(vdot, MARATHON_M) * 60),
    weight: 0,
  };
}

// Easy long-run NGP (min/km) → implied marathon pace. Long runs are run easier
// than race pace; a common heuristic is easy pace ≈ marathon pace × ~1.10, so
// marathon pace ≈ NGP / 1.10. NOT routed through VDOT (it isn't a race effort).
// This is the softest signal — the low base weight below keeps its inherent
// effort-dependent noise from dominating the blend.
const EASY_TO_MP = 1.10;
function longRunSignal(ngpMinKm: number, date: string | null): PredictionSignal | null {
  if (!(ngpMinKm > 0)) return null;
  const mpMinKm = ngpMinKm / EASY_TO_MP;
  return {
    source: 'long_run', label: `Long-run NGP ${fmtPace(ngpMinKm)}/km`, date,
    impliedMarathonSeconds: Math.round(mpMinKm * (MARATHON_M / 1000) * 60),
    weight: 0,
  };
}

// ── recency weighting + blend ─────────────────────────────────

const BASE_RELIABILITY: Record<PredictionSignal['source'], number> = {
  race: 1.0,
  threshold: 0.7,
  long_run: 0.35,
};
const RECENCY_HALFLIFE_DAYS = 42;   // a signal's recency weight halves every 6 weeks

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso + 'T00:00:00Z');
  const b = Date.parse(toIso + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.abs(b - a) / 86400000;
}

export interface PredictionInputs {
  asOf: string;                                          // YYYY-MM-DD (for recency)
  thresholdMinKm: number | null;
  thresholdDate?: string | null;                         // defaults to asOf (a current setting)
  races: { distanceM: number; timeSeconds: number; date: string | null; label: string }[];
  longRunNgpMinKm: number | null;                        // aggregate (e.g. median of recent long runs)
  longRunDate?: string | null;
}

// Blend the available signals into one predicted marathon time (seconds), plus the
// per-signal breakdown for display. Returns null prediction when nothing usable.
export function predictMarathon(inputs: PredictionInputs): MarathonPrediction {
  const raw: PredictionSignal[] = [];

  for (const r of inputs.races) {
    const s = raceSignal(r.distanceM, r.timeSeconds, r.date, r.label);
    if (s) raw.push(s);
  }
  if (inputs.thresholdMinKm) {
    const s = thresholdSignal(inputs.thresholdMinKm, inputs.thresholdDate ?? inputs.asOf);
    if (s) raw.push(s);
  }
  if (inputs.longRunNgpMinKm) {
    const s = longRunSignal(inputs.longRunNgpMinKm, inputs.longRunDate ?? inputs.asOf);
    if (s) raw.push(s);
  }

  if (!raw.length) return { predictedSeconds: null, signals: [] };

  for (const s of raw) {
    const recency = s.date ? Math.pow(0.5, daysBetween(s.date, inputs.asOf) / RECENCY_HALFLIFE_DAYS) : 0.5;
    s.weight = BASE_RELIABILITY[s.source] * recency;
  }

  const totalW = raw.reduce((a, s) => a + s.weight, 0);
  const predictedSeconds = totalW > 0
    ? Math.round(raw.reduce((a, s) => a + s.impliedMarathonSeconds * s.weight, 0) / totalW)
    : null;

  raw.sort((a, b) => b.weight - a.weight);
  return { predictedSeconds, signals: raw };
}

// ── small formatters (shared by the card + benchmarks) ────────

// "h:mm:ss" from seconds (marathon-scale), dropping a leading zero hour.
export function fmtHms(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

// "m:ss" pace from a min/km float.
export function fmtPace(minKm: number): string {
  const m = Math.floor(minKm);
  const s = Math.round((minKm - m) * 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
}

// Parse "h:mm:ss" or "m:ss" (a target_time / finish string) to seconds, or null.
export function parseHmsToSeconds(str: string | null | undefined): number | null {
  if (!str) return null;
  const parts = str.trim().split(':').map(Number);
  if (parts.some(n => Number.isNaN(n))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}
