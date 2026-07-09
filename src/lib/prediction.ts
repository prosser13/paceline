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

// Canonical race distances the prediction shows (Benchmarks table + race-page
// gating). The blend runs in VDOT space, so a time exists for ANY distance — this is
// just the display set. loadTrajectory (the campaign scoreboard) stays marathon-only
// by its own gate; the post-race predicted-vs-actual banner derives at the race's
// actual distance and so isn't limited to this list.
export const PREDICTABLE_DISTANCES_M: number[] = [5000, 10000, 21097, MARATHON_M];

// The canonical predictable distance a race maps to (within tolerance), or null.
export function predictableDistanceM(distanceKm: number | null): number | null {
  if (distanceKm == null) return null;
  const m = distanceKm * 1000;
  return PREDICTABLE_DISTANCES_M.find(d => Math.abs(d - m) < Math.max(300, d * 0.03)) ?? null;
}

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

// The threshold pace (min/km) implied by a VDOT — the pace sustainable for a
// ~60-minute effort. Inverse of the forward threshold→VDOT map used in the
// prediction, so a race's VDOT can be read back as "what your threshold is now".
export function vdotToThresholdPaceMinKm(vdot: number): number | null {
  if (!(vdot > 0)) return null;
  // Bisect the distance covered in 60 min at this VDOT (more distance → higher VDOT).
  let lo = 3000, hi = 30000;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (danielsVdot(mid, 60) < vdot) lo = mid; else hi = mid;
  }
  const distanceM = (lo + hi) / 2;
  return 60 / (distanceM / 1000);   // min/km
}

// A single input performance, expressed as an implied fitness VDOT (the blend runs
// in VDOT space, so any distance can be derived on read).
export interface PredictionSignal {
  source: 'race' | 'threshold' | 'long_run';
  label: string;                 // e.g. "10K 33:40 · 21 Jun"
  date: string | null;           // ISO date the signal is dated to (for recency)
  vdot: number;                  // implied fitness VDOT
  impliedMarathonSeconds: number;// = time at 42.195 km for this VDOT (display)
  weight: number;                // final blend weight (base reliability × recency)
}

export interface MarathonPrediction {
  vdot: number | null;           // blended fitness VDOT (derive any distance from this)
  predictedSeconds: number | null;
  signals: PredictionSignal[];   // every signal that contributed, weight-sorted
}
export type RacePrediction = MarathonPrediction;

// Predicted time (seconds) at a distance for a given fitness VDOT, or null.
export function predictedTimeAt(vdot: number | null, distanceM: number): number | null {
  if (vdot == null || !(vdot > 0) || !(distanceM > 0)) return null;
  return Math.round(vdotToTimeMin(vdot, distanceM) * 60);
}

// ── signal → implied marathon time ────────────────────────────

// A race result: VDOT from the actual performance, projected to 42.195 km.
function raceSignal(distanceM: number, timeSeconds: number, date: string | null, label: string): PredictionSignal | null {
  if (!(distanceM > 0) || !(timeSeconds > 0)) return null;
  const vdot = danielsVdot(distanceM, timeSeconds / 60);
  if (!(vdot > 0)) return null;
  return {
    source: 'race', label, date, vdot,
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
    source: 'threshold', label: `Threshold ${fmtPace(thresholdMinKm)}/km`, date, vdot,
    impliedMarathonSeconds: Math.round(vdotToTimeMin(vdot, MARATHON_M) * 60),
    weight: 0,
  };
}

// Easy long-run NGP (min/km) → implied marathon pace. Long runs are run easier
// than race pace; a common heuristic is easy pace ≈ marathon pace × ~1.10, so
// marathon pace ≈ NGP / 1.10. The implied marathon TIME (not the pace) is what maps
// to a VDOT — round-tripping through VDOT is exact, so the marathon number is
// unchanged; it just lets this signal join the VDOT blend. Softest signal (low base
// weight keeps its effort-dependent noise from dominating).
const EASY_TO_MP = 1.10;
function longRunSignal(ngpMinKm: number, date: string | null): PredictionSignal | null {
  if (!(ngpMinKm > 0)) return null;
  const mpMinKm = ngpMinKm / EASY_TO_MP;
  const impliedMarathonSeconds = Math.round(mpMinKm * (MARATHON_M / 1000) * 60);
  const vdot = danielsVdot(MARATHON_M, impliedMarathonSeconds / 60);
  if (!(vdot > 0)) return null;
  return {
    source: 'long_run', label: `Long-run NGP ${fmtPace(ngpMinKm)}/km`, date, vdot,
    impliedMarathonSeconds,
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

  if (!raw.length) return { vdot: null, predictedSeconds: null, signals: [] };

  for (const s of raw) {
    const recency = s.date ? Math.pow(0.5, daysBetween(s.date, inputs.asOf) / RECENCY_HALFLIFE_DAYS) : 0.5;
    s.weight = BASE_RELIABILITY[s.source] * recency;
  }

  // Blend in VDOT space → one fitness number, so a time exists for every distance.
  const totalW = raw.reduce((a, s) => a + s.weight, 0);
  const vdot = totalW > 0 ? raw.reduce((a, s) => a + s.vdot * s.weight, 0) / totalW : null;
  const predictedSeconds = predictedTimeAt(vdot, MARATHON_M);

  raw.sort((a, b) => b.weight - a.weight);
  return { vdot, predictedSeconds, signals: raw };
}

// Marathon prediction is just the race prediction read at 42.195 km. Alias kept so
// existing callers (getCurrentPrediction) don't change.
export const predictRace = predictMarathon;

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
