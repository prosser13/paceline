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

// Long-run quality from the Strava streams (PB-campaign wave 3). Both metrics are
// grade-adjusted (via the same Minetti cost curve NGP uses), so hills don't distort
// them:
//   decouplingPct — aerobic decoupling: the drop in grade-adjusted-speed:HR
//     efficiency from the first half to the second (cardiac drift). Positive =
//     efficiency fell (HR drifted up for the same effort). Needs the HR stream.
//   paceDecayPct  — grade-adjusted pace of the final third vs the first two-thirds.
//     Positive = slowed toward the end; negative = negative split.
// Either is null when the streams can't support it (too short, mismatched, no HR).
export function computeLongRunQuality(
  distanceM: number[] | null | undefined,
  timeS: number[] | null | undefined,
  heartrate: number[] | null | undefined,
  altitudeM: number[] | null | undefined,
): { decouplingPct: number | null; paceDecayPct: number | null } {
  const none = { decouplingPct: null, paceDecayPct: null };
  if (!distanceM?.length || !timeS?.length || distanceM.length !== timeS.length) return none;
  const n = distanceM.length;
  if (n < 4) return none;

  // Per-step grade-adjusted distance (metres), using the Minetti cost multiplier.
  const gaStep = new Array<number>(n).fill(0);
  const hasAlt = altitudeM?.length === n;
  for (let i = 1; i < n; i++) {
    const dStep = distanceM[i] - distanceM[i - 1];
    if (dStep <= 0) continue;
    let mult = 1;
    if (hasAlt) {
      const grade = dStep > 0.5 ? (altitudeM![i] - altitudeM![i - 1]) / dStep : 0;
      mult = gradeCostMultiplier(grade);
    }
    gaStep[i] = dStep * mult;
  }

  const round1 = (x: number) => Math.round(x * 10) / 10;

  // ── final-third pace decay (split by distance) ──
  let paceDecayPct: number | null = null;
  const totalDist = distanceM[n - 1] - distanceM[0];
  if (totalDist > 0) {
    const twoThirdsM = distanceM[0] + totalDist * (2 / 3);
    let gaFirst = 0, gaLast = 0, idxSplit = n - 1;
    for (let i = 1; i < n; i++) {
      if (distanceM[i] <= twoThirdsM) { gaFirst += gaStep[i]; idxSplit = i; }
      else gaLast += gaStep[i];
    }
    const tFirst = timeS[idxSplit] - timeS[0];
    const tLast = timeS[n - 1] - timeS[idxSplit];
    if (gaFirst > 0 && gaLast > 0 && tFirst > 0 && tLast > 0) {
      const paceFirst = (tFirst / gaFirst) * 1000 / 60;   // grade-adjusted min/km
      const paceLast = (tLast / gaLast) * 1000 / 60;
      paceDecayPct = round1(((paceLast - paceFirst) / paceFirst) * 100);
    }
  }

  // ── aerobic decoupling (grade-adjusted speed : HR, first half vs second) ──
  let decouplingPct: number | null = null;
  if (heartrate?.length === n) {
    const totalT = timeS[n - 1] - timeS[0];
    const midT = timeS[0] + totalT / 2;
    let mid = 1;
    for (let i = 1; i < n; i++) { if (timeS[i] <= midT) mid = i; }
    const efficiency = (i0: number, i1: number): number | null => {
      let ga = 0, hrSum = 0, hrN = 0;
      for (let i = i0 + 1; i <= i1; i++) ga += gaStep[i];
      for (let i = i0; i <= i1; i++) { const h = heartrate![i]; if (h > 0) { hrSum += h; hrN++; } }
      const dur = timeS[i1] - timeS[i0];
      if (ga <= 0 || dur <= 0 || hrN === 0) return null;
      return (ga / dur) / (hrSum / hrN);                  // (m/s grade-adjusted) per bpm
    };
    const e1 = efficiency(0, mid), e2 = efficiency(mid, n - 1);
    if (e1 != null && e2 != null && e1 > 0) decouplingPct = round1(((e1 - e2) / e1) * 100);
  }

  return { decouplingPct, paceDecayPct };
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

// Efficiency Factor — grade-adjusted metres/min per heartbeat. A whole-run aerobic
// efficiency proxy: how much (grade-adjusted) speed you get per bpm. Rising over a
// block = fitter. Unlike aerobic decoupling it is NOT distorted by a within-run
// negative split (it's a single aggregate), so it's the right durability signal for
// a block of prescribed negative-split long runs.
//
//   EF = grade-adjusted speed (m/min) / avg HR = 1000 / (paceMinKm × avgHr)
//
// `paceMinKm` is NGP when available (grade-adjusted), else average pace. Needs HR.
// Returns null when either input is missing. Rounded to 2 dp.
export function efficiencyFactor(paceMinKm: number | null, avgHr: number | null): number | null {
  if (!paceMinKm || paceMinKm <= 0 || !avgHr || avgHr <= 0) return null;
  return Math.round((1000 / (paceMinKm * avgHr)) * 100) / 100;
}

// Parse a threshold-pace string ("m:ss" per km) to a numeric pace in min/km.
// e.g. "3:40" → 3.6667. Tolerates a missing seconds component.
export function parseThresholdPace(str: string): number {
  const [m, s] = str.split(':').map(Number);
  return m + (s || 0) / 60;
}

// One TSS for either sport: run (NGP/pace vs threshold) when a `runPace` is given,
// else ride (power vs FTP). `runPace` is the caller's chosen pace (NGP ?? avg).
// Mirrors the same hours × IF² × 100 model the run formula uses. Returns null
// without enough to compute (e.g. strength/yoga with neither pace nor power).
export function sessionTss(
  input: { mins: number | null; runPace: number | null; power: number | null },
  threshMinKm: number | null,
  ftp: number | null,
): number | null {
  const run = runTss(input.mins, input.runPace, threshMinKm);
  if (run != null) return run;
  if (input.mins != null && input.power != null && ftp && ftp > 0) {
    const intensity = input.power / ftp;
    return Math.round((input.mins / 60) * intensity * intensity * 100);
  }
  return null;
}
