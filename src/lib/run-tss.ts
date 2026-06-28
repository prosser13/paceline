// Running TSS via Normalized Graded Pace (NGP), the TrainingPeaks rTSS model.
//
// rTSS uses the SAME formula as our pace-based TSS — hours × IF² × 100 — but the
// intensity factor is built from NGP rather than raw average pace:
//
//   IF   = threshold_pace / NGP          (paces in min/km; lower = faster)
//   rTSS = (duration_h) × IF² × 100
//
// NGP improves on average pace in two ways:
//   1. Grade adjustment — uphill metres cost more, downhill less, so NGP reports
//      a flat-equivalent pace (Minetti's energy-cost-of-running curve).
//   2. Normalisation — a 30 s rolling average then a 4th-power mean (like
//      Normalized Power), so surges/intervals weigh more than a flat average.
//
// Needs the per-sample distance + altitude streams (fetched from Strava during
// sync). With only averages stored we cannot compute it — see computeNgp's null
// returns, which make the caller fall back to average pace.

// Minetti et al. (2002) energy cost of running, Cr(i) in J/kg/m, as a function of
// gradient i (rise/run). Returned relative to flat (Cr(0) = 3.6) so it reads as a
// cost multiplier: ~1.66 at +10 %, ~0.60 at −10 % (downhill is cheaper, to a point).
export function gradeCostMultiplier(grade: number): number {
  const i = Math.max(-0.45, Math.min(0.45, grade));   // Minetti's measured range
  const cr = 155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3 + 46.3 * i ** 2 + 19.5 * i + 3.6;
  return cr / 3.6;
}

// Resample a (time → value) stream onto a 1 Hz grid [t0 … t0+n] by linear
// interpolation, in a single forward pass (streams are monotonic in time).
function resample(time: number[], value: number[], t0: number, n: number): number[] {
  const out = new Array<number>(n + 1);
  let j = 0;
  for (let s = 0; s <= n; s++) {
    const t = t0 + s;
    while (j < time.length - 2 && time[j + 1] <= t) j++;
    const span = time[j + 1] - time[j] || 1;
    const f = Math.max(0, Math.min(1, (t - time[j]) / span));
    out[s] = value[j] + (value[j + 1] - value[j]) * f;
  }
  return out;
}

// Normalized Graded Pace in min/km from the Strava streams. Returns null when
// the streams are unusable (too short, mismatched, no movement) — the caller
// then keeps average pace.
export function computeNgp(
  distanceM: number[] | null | undefined,
  timeS: number[] | null | undefined,
  altitudeM: number[] | null | undefined,
): number | null {
  if (!distanceM?.length || !timeS?.length || distanceM.length !== timeS.length) return null;
  const t0 = timeS[0];
  const span = timeS[timeS.length - 1] - t0;
  if (span < 60) return null;                       // under a minute: not worth normalising
  const n = Math.floor(span);

  const dist = resample(timeS, distanceM, t0, n);
  const alt = altitudeM?.length === timeS.length ? resample(timeS, altitudeM, t0, n) : null;

  // Grade-adjusted speed (m/s) for each 1 s step.
  const gaSpeed = new Array<number>(n);
  for (let s = 1; s <= n; s++) {
    const v = dist[s] - dist[s - 1];                // m travelled this second = m/s
    if (v <= 0) { gaSpeed[s - 1] = 0; continue; }
    let mult = 1;
    if (alt) {
      // Only trust grade while genuinely moving, else GPS altitude noise explodes it.
      const grade = v > 0.5 ? (alt[s] - alt[s - 1]) / v : 0;
      mult = gradeCostMultiplier(grade);
    }
    gaSpeed[s - 1] = v * mult;
  }

  // 30 s rolling average, then 4th-power mean → 4th root (the NP normalisation).
  const W = 30;
  let windowSum = 0;
  let p4sum = 0, p4n = 0;
  for (let i = 0; i < gaSpeed.length; i++) {
    windowSum += gaSpeed[i];
    if (i >= W) windowSum -= gaSpeed[i - W];
    if (i >= W - 1) {
      const avg = windowSum / W;
      p4sum += avg ** 4;
      p4n++;
    }
  }
  if (!p4n) return null;
  const ngpSpeed = (p4sum / p4n) ** 0.25;           // m/s
  if (!(ngpSpeed > 0)) return null;
  return 1000 / ngpSpeed / 60;                      // → min/km
}

// The shared run-TSS formula. `paceMinKm` is NGP when available, else average
// pace; `threshMinKm` is the user's threshold pace. Returns null without enough
// to compute.
export function runTss(
  durationMins: number | null,
  paceMinKm: number | null,
  threshMinKm: number | null,
): number | null {
  if (durationMins == null || !paceMinKm || !threshMinKm) return null;
  const intensity = threshMinKm / paceMinKm;        // faster than threshold → > 1
  return Math.round((durationMins / 60) * intensity * intensity * 100);
}
