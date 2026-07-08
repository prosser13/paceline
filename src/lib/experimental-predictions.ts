// Experimental marathon-time predictors — three alternative models shown as
// separate tiles on the Benchmarks page, alongside (not blended into) the main
// VDOT-based prediction (src/lib/prediction.ts).
//
// Each rests on a fundamentally different theory of what predicts a marathon:
//   1. Riegel      — endurance scaling: a power law over your own race results,
//                    with the fatigue exponent fitted to YOUR races when possible.
//   2. Tanda       — training-log regression: weekly volume + habitual training
//                    pace over the last 8 weeks; ignores races entirely.
//   3. Cardiac EF  — heart-rate economy: grade-adjusted speed per heartbeat on
//                    long runs, projected to an expected marathon heart rate;
//                    ignores pace performances entirely.
//
// All three are deliberately independent of the main engine so they can disagree
// with it — that disagreement is the point (the tiles are labelled experimental).

const MARATHON_M = 42195;
const MARATHON_KM = MARATHON_M / 1000;

// One experimental prediction, ready for a Benchmarks tile. `detail` summarises
// the inputs the model actually used; `unavailableReason` is set (and
// predictedSeconds null) when the data can't support the model yet.
export interface ExperimentalPrediction {
  key: 'riegel' | 'tanda' | 'cardiac';
  predictedSeconds: number | null;
  detail: string | null;
  unavailableReason: string | null;
}

// ── 1. Riegel endurance scaling ───────────────────────────────
//
// Riegel (1981): T2 = T1 × (D2/D1)^k, k ≈ 1.06 for trained runners. Unlike
// VDOT (an oxygen-cost physiology model), this is a pure empirical scaling law —
// and k is personal: speed-biased runners fade harder (k > 1.06), diesel-engine
// runners hold pace (k closer to 1.02). With races at ≥2 distinct distances we
// fit k to the athlete's own results (least-squares in log-log space, most
// recent result per distance); with one distance we fall back to 1.06.

const RIEGEL_DEFAULT_K = 1.06;
const RIEGEL_K_MIN = 1.01;   // sanity clamps — beyond these the fit is noise
const RIEGEL_K_MAX = 1.20;

export interface RiegelRace { distanceM: number; timeSeconds: number; date: string | null; label: string }

// Two distances count as "distinct" when far enough apart for a slope to mean
// anything (a 10K vs a 10-miler, not two 10Ks with GPS wobble).
const DISTINCT_RATIO = 1.3;

export function riegelPrediction(races: RiegelRace[]): ExperimentalPrediction {
  const usable = races.filter(r => r.distanceM > 0 && r.timeSeconds > 0);
  if (!usable.length) {
    return { key: 'riegel', predictedSeconds: null, detail: null, unavailableReason: 'Needs at least one race result in the last 12 months.' };
  }

  // Most recent result per distinct distance bucket (rounded to 500 m).
  const byDistance = new Map<number, RiegelRace>();
  for (const r of [...usable].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))) {
    byDistance.set(Math.round(r.distanceM / 500), r);
  }
  const points = [...byDistance.values()];

  // Fit k over log(distance) → log(time) when the distances genuinely spread.
  let k = RIEGEL_DEFAULT_K;
  let fitted = false;
  const spread = Math.max(...points.map(p => p.distanceM)) / Math.min(...points.map(p => p.distanceM));
  if (points.length >= 2 && spread >= DISTINCT_RATIO) {
    const xs = points.map(p => Math.log(p.distanceM));
    const ys = points.map(p => Math.log(p.timeSeconds));
    const n = xs.length;
    const sx = xs.reduce((a, b) => a + b, 0), sy = ys.reduce((a, b) => a + b, 0);
    const sxx = xs.reduce((a, b) => a + b * b, 0);
    const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0);
    const denom = n * sxx - sx * sx;
    if (denom > 0) {
      const slope = (n * sxy - sx * sy) / denom;
      if (Number.isFinite(slope)) {
        k = Math.min(RIEGEL_K_MAX, Math.max(RIEGEL_K_MIN, slope));
        fitted = true;
      }
    }
  }

  // Anchor on the most recent race and scale it to marathon distance.
  const anchor = [...usable].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))[0];
  const predictedSeconds = Math.round(anchor.timeSeconds * Math.pow(MARATHON_M / anchor.distanceM, k));
  const detail = fitted
    ? `k = ${k.toFixed(2)} fitted from ${points.length} race distances · anchored on ${anchor.label}`
    : `k = ${RIEGEL_DEFAULT_K} (default — one race distance) · anchored on ${anchor.label}`;
  return { key: 'riegel', predictedSeconds, detail, unavailableReason: null };
}

// ── 2. Tanda training-log regression ──────────────────────────
//
// Tanda (2011, J. Human Sport & Exercise): across recreational marathoners the
// finish pace is predicted by the previous ~8 weeks of training alone:
//
//   Pm (sec/km) = 17.1 + 140.0 · exp(−0.0053 · K) + 0.55 · P
//
// where K = mean weekly distance (km/wk) and P = mean training pace (sec/km).
// No races, no threshold, no HR — it asks "what does the work you've actually
// logged imply?", which makes it the natural cross-check on performance-based
// models (and the one that punishes a missed block honestly).

export const TANDA_WINDOW_DAYS = 56;   // the study's ~8-week observation window
const TANDA_MIN_RUNS = 8;
const TANDA_MIN_WEEKLY_KM = 20;        // below this the regression is extrapolating wildly

export interface TrainingLogRun { date: string; km: number; secs: number }

export function tandaPrediction(runs: TrainingLogRun[], windowDays = TANDA_WINDOW_DAYS): ExperimentalPrediction {
  const usable = runs.filter(r => r.km > 0 && r.secs > 0);
  const totalKm = usable.reduce((a, r) => a + r.km, 0);
  const totalSecs = usable.reduce((a, r) => a + r.secs, 0);
  const weeklyKm = totalKm / (windowDays / 7);

  if (usable.length < TANDA_MIN_RUNS || weeklyKm < TANDA_MIN_WEEKLY_KM) {
    return {
      key: 'tanda', predictedSeconds: null, detail: null,
      unavailableReason: `Needs ≥${TANDA_MIN_RUNS} runs and ≥${TANDA_MIN_WEEKLY_KM} km/week over the last 8 weeks to regress from.`,
    };
  }

  const meanPaceSecKm = totalSecs / totalKm;                    // P
  const paceSecKm = 17.1 + 140.0 * Math.exp(-0.0053 * weeklyKm) + 0.55 * meanPaceSecKm;
  const predictedSeconds = Math.round(paceSecKm * MARATHON_KM);
  const detail = `${Math.round(weeklyKm)} km/wk at ${fmtPaceSec(meanPaceSecKm)}/km avg over 8 weeks (${usable.length} runs)`;
  return { key: 'tanda', predictedSeconds, detail, unavailableReason: null };
}

// ── 3. Cardiac economy (EF → marathon HR) ─────────────────────
//
// Efficiency Factor = grade-adjusted metres/min per heartbeat on long runs
// (already computed per run on the Benchmarks page). If speed-per-beat holds
// roughly constant across aerobic intensities, then marathon speed is simply
//
//   speed (m/min) = median EF × expected marathon HR
//
// with marathon HR taken as ~90% of threshold HR (fallback ~84% of max HR) —
// the classic zone placement of marathon effort. This model never looks at a
// pace performance: it reads how much speed your aerobic engine buys per beat,
// so it rewards durability (a rising EF) rather than speed.

const MARATHON_PCT_OF_LTHR = 0.90;
const MARATHON_PCT_OF_MAX = 0.84;
const CARDIAC_MIN_RUNS = 2;

export interface CardiacInputs {
  efValues: number[];                 // EF per recent long run (m/min per bpm)
  thresholdHr: number | null;
  maxHr: number | null;
}

export function cardiacPrediction({ efValues, thresholdHr, maxHr }: CardiacInputs): ExperimentalPrediction {
  const efs = efValues.filter(v => v > 0);
  if (efs.length < CARDIAC_MIN_RUNS) {
    return {
      key: 'cardiac', predictedSeconds: null, detail: null,
      unavailableReason: `Needs ≥${CARDIAC_MIN_RUNS} long runs with heart rate in the last 12 weeks.`,
    };
  }
  const marathonHr = thresholdHr != null && thresholdHr > 0
    ? Math.round(thresholdHr * MARATHON_PCT_OF_LTHR)
    : maxHr != null && maxHr > 0 ? Math.round(maxHr * MARATHON_PCT_OF_MAX) : null;
  if (marathonHr == null) {
    return {
      key: 'cardiac', predictedSeconds: null, detail: null,
      unavailableReason: 'Needs a threshold or max heart rate in Settings → Zones.',
    };
  }

  const ef = median(efs)!;
  const speedMPerMin = ef * marathonHr;
  if (!(speedMPerMin > 0)) {
    return { key: 'cardiac', predictedSeconds: null, detail: null, unavailableReason: 'Long-run efficiency data looks unusable.' };
  }
  const predictedSeconds = Math.round((MARATHON_M / speedMPerMin) * 60);
  const source = thresholdHr != null && thresholdHr > 0 ? `${MARATHON_PCT_OF_LTHR * 100}% of LTHR` : `${MARATHON_PCT_OF_MAX * 100}% of max HR`;
  const detail = `median EF ${ef.toFixed(2)} × ${marathonHr} bpm (${source}) over ${efs.length} long runs`;
  return { key: 'cardiac', predictedSeconds, detail, unavailableReason: null };
}

// ── shared internals ──────────────────────────────────────────

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// "m:ss" from a sec/km pace value.
function fmtPaceSec(secKm: number): string {
  const m = Math.floor(secKm / 60);
  const s = Math.round(secKm - m * 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
}
