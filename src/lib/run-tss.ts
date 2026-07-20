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

// A structural split profile of a run, computed once at sync from the same streams
// so the coach review READS it instead of re-deriving pacing from a whole-run
// average (which structurally hid the 19 Jul Dragon 50 fast/hot open + late fade).
// Paces are min/km; GAP is the grade-adjusted equivalent (Minetti, as NGP).
export interface SplitProfile {
  km_count: number;
  quartiles: { pace_min_km: number | null; gap_min_km: number | null }[];   // by distance, 4
  first_20pct: {
    pace_min_km: number | null; gap_min_km: number | null;
    target_pace_min_km: number | null; dev_sec_km: number | null; dev_pct: number | null;
  } | null;
  stopped_secs: number | null;   // elapsed − moving
  stopped_pct: number | null;    // stopped as % of elapsed
  slow_split_count: number | null; // per-km splits slower than 1.5× the median km
  decoupling_pct: number | null;   // carried through (whole-run)
  pace_decay_pct: number | null;   // carried through (whole-run)
}

export function computeSplitProfile(
  distanceM: number[] | null | undefined,
  timeS: number[] | null | undefined,
  heartrate: number[] | null | undefined,
  altitudeM: number[] | null | undefined,
  movingTimeSecs: number | null,
  targetPaceMinKm: number | null,
  lrq: { decouplingPct: number | null; paceDecayPct: number | null },
): SplitProfile | null {
  if (!distanceM?.length || !timeS?.length || distanceM.length !== timeS.length) return null;
  const n = distanceM.length;
  if (n < 4) return null;
  const startD = distanceM[0], endD = distanceM[n - 1];
  const totalD = endD - startD;
  const startT = timeS[0], endT = timeS[n - 1];
  const elapsed = endT - startT;
  if (totalD <= 0 || elapsed <= 0) return null;

  // Grade-adjusted metres per step (Minetti), same basis as NGP / long-run quality.
  const hasAlt = altitudeM?.length === n;
  const gaStep = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    const d = distanceM[i] - distanceM[i - 1];
    if (d <= 0) continue;
    let mult = 1;
    if (hasAlt) {
      const grade = d > 0.5 ? (altitudeM![i] - altitudeM![i - 1]) / d : 0;
      mult = gradeCostMultiplier(grade);
    }
    gaStep[i] = d * mult;
  }

  // Interpolated elapsed time (s) at an absolute cumulative distance (m).
  const timeAt = (dTarget: number): number => {
    if (dTarget <= startD) return startT;
    if (dTarget >= endD) return endT;
    for (let i = 1; i < n; i++) {
      if (distanceM[i] >= dTarget) {
        const d0 = distanceM[i - 1], d1 = distanceM[i], t0 = timeS[i - 1], t1 = timeS[i];
        return d1 === d0 ? t1 : t0 + (t1 - t0) * ((dTarget - d0) / (d1 - d0));
      }
    }
    return endT;
  };

  const round2 = (x: number) => Math.round(x * 100) / 100;
  const round1 = (x: number) => Math.round(x * 10) / 10;

  // Raw pace + grade-adjusted pace (min/km) over an absolute distance window.
  const windowPace = (dLo: number, dHi: number): { pace_min_km: number | null; gap_min_km: number | null } => {
    if (dHi <= dLo) return { pace_min_km: null, gap_min_km: null };
    let ga = 0;
    for (let i = 1; i < n; i++) {
      const a = distanceM[i - 1], b = distanceM[i];
      if (b <= dLo || a >= dHi) continue;
      const step = b - a;
      if (step <= 0) continue;
      const frac = (Math.min(b, dHi) - Math.max(a, dLo)) / step;   // portion of this step inside the window
      ga += gaStep[i] * frac;
    }
    const dur = timeAt(dHi) - timeAt(dLo);
    const rawKm = (dHi - dLo) / 1000;
    if (dur <= 0 || rawKm <= 0) return { pace_min_km: null, gap_min_km: null };
    return {
      pace_min_km: round2((dur / 60) / rawKm),
      gap_min_km: ga > 0 ? round2((dur / 60) / (ga / 1000)) : null,
    };
  };

  const quartiles = [0, 1, 2, 3].map(q =>
    windowPace(startD + totalD * (q / 4), startD + totalD * ((q + 1) / 4)));

  const f = windowPace(startD, startD + totalD * 0.2);
  const first_20pct = f.pace_min_km != null ? {
    pace_min_km: f.pace_min_km,
    gap_min_km: f.gap_min_km,
    target_pace_min_km: targetPaceMinKm != null ? round2(targetPaceMinKm) : null,
    dev_sec_km: targetPaceMinKm != null ? Math.round((f.pace_min_km - targetPaceMinKm) * 60) : null,
    dev_pct: targetPaceMinKm ? round1(((f.pace_min_km - targetPaceMinKm) / targetPaceMinKm) * 100) : null,
  } : null;

  const stopped_secs = movingTimeSecs != null ? Math.max(0, Math.round(elapsed - movingTimeSecs)) : null;
  const stopped_pct = stopped_secs != null ? round1((stopped_secs / elapsed) * 100) : null;

  // Per-km split outliers: km splits slower than 1.5× the median km split.
  const kmCount = Math.floor(totalD / 1000);
  let slow_split_count: number | null = null;
  if (kmCount >= 3) {
    const splits: number[] = [];
    for (let k = 1; k <= kmCount; k++) {
      const t = timeAt(startD + k * 1000) - timeAt(startD + (k - 1) * 1000);
      if (t > 0) splits.push(t);
    }
    if (splits.length >= 3) {
      const sorted = [...splits].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      slow_split_count = splits.filter(s => s > median * 1.5).length;
    }
  }

  return {
    km_count: kmCount,
    quartiles,
    first_20pct,
    stopped_secs,
    stopped_pct,
    slow_split_count,
    decoupling_pct: lrq.decouplingPct,
    pace_decay_pct: lrq.paceDecayPct,
  };
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

// One TSS across sports: run (NGP/pace vs threshold) when a `runPace` is given,
// else ride (power vs FTP), else swim (CSS vs pace-per-100m). All share the same
// hours × IF² × 100 model — only the intensity factor differs per sport. Returns
// null without enough to compute (e.g. strength/yoga with none of the inputs).
export function sessionTss(
  input: { mins: number | null; runPace: number | null; power: number | null; swimPaceSec?: number | null },
  threshMinKm: number | null,
  ftp: number | null,
  cssSec?: number | null,
): number | null {
  const run = runTss(input.mins, input.runPace, threshMinKm);
  if (run != null) return run;
  if (input.mins != null && input.power != null && ftp && ftp > 0) {
    const intensity = input.power / ftp;
    return Math.round((input.mins / 60) * intensity * intensity * 100);
  }
  // Swim: IF = CSS ÷ actual pace (both sec/100 m); faster than CSS → IF > 1.
  if (input.mins != null && input.swimPaceSec && input.swimPaceSec > 0 && cssSec && cssSec > 0) {
    const intensity = cssSec / input.swimPaceSec;
    return Math.round((input.mins / 60) * intensity * intensity * 100);
  }
  return null;
}
