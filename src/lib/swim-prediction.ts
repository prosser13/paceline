// Swim time predictions (750 m sprint-tri, 1900 m 70.3) via Riegel's endurance
// scaling — the same power law the running Riegel tile uses, but over the athlete's
// own SWIM time-trials and projected to swim race distances. VDOT (a running
// physiology model) does NOT transfer to swimming, so this is deliberately its own
// small model rather than a branch of src/lib/prediction.ts.
//
//   T2 = T1 × (D2/D1)^k,  k ≈ 1.02–1.06 (swimming fades less than running).
// With ≥2 distinct trial distances we fit k in log-log space; else a 1.05 default.

export interface SwimTrial { distanceM: number; timeSeconds: number; date: string | null; label: string }

export interface SwimPrediction {
  targetM: number;
  predictedSeconds: number | null;
  detail: string | null;
  unavailableReason: string | null;
}

const DEFAULT_K = 1.05;
const K_MIN = 1.00;
const K_MAX = 1.15;
const DISTINCT_RATIO = 1.3;   // distances must spread this much for a fitted k to mean anything

// Fit the Riegel exponent k from the trials (most recent per ~50 m distance bucket).
// Returns { k, fitted, points }.
function fitK(trials: SwimTrial[]): { k: number; fitted: boolean; points: SwimTrial[] } {
  const byDist = new Map<number, SwimTrial>();
  for (const t of [...trials].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))) {
    byDist.set(Math.round(t.distanceM / 50), t);   // newest wins per bucket
  }
  const points = [...byDist.values()];
  let k = DEFAULT_K, fitted = false;
  if (points.length >= 2) {
    const spread = Math.max(...points.map(p => p.distanceM)) / Math.min(...points.map(p => p.distanceM));
    if (spread >= DISTINCT_RATIO) {
      const xs = points.map(p => Math.log(p.distanceM));
      const ys = points.map(p => Math.log(p.timeSeconds));
      const n = xs.length;
      const sx = xs.reduce((a, b) => a + b, 0), sy = ys.reduce((a, b) => a + b, 0);
      const sxx = xs.reduce((a, b) => a + b * b, 0);
      const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0);
      const denom = n * sxx - sx * sx;
      if (denom > 0) {
        const slope = (n * sxy - sx * sy) / denom;
        if (Number.isFinite(slope)) { k = Math.min(K_MAX, Math.max(K_MIN, slope)); fitted = true; }
      }
    }
  }
  return { k, fitted, points };
}

// Predict the time for one target distance from the athlete's swim trials.
export function swimPrediction(trials: SwimTrial[], targetM: number): SwimPrediction {
  const usable = trials.filter(t => t.distanceM > 0 && t.timeSeconds > 0);
  if (!usable.length) {
    return { targetM, predictedSeconds: null, detail: null, unavailableReason: 'Log a swim time-trial to enable this (two distances for a fitted curve).' };
  }
  const { k, fitted, points } = fitK(usable);
  // Anchor on the most recent trial and scale it to the target distance.
  const anchor = [...usable].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))[0];
  const predictedSeconds = Math.round(anchor.timeSeconds * Math.pow(targetM / anchor.distanceM, k));
  const detail = fitted
    ? `k = ${k.toFixed(2)} from ${points.length} trial distances · anchored on ${anchor.label}`
    : `k = ${DEFAULT_K} (default — one trial distance) · anchored on ${anchor.label}`;
  return { targetM, predictedSeconds, detail, unavailableReason: null };
}
