// Sweat-rate / fluid-loss model (Málaga hydration wave). Pure + deterministic —
// no I/O, no LLM. Turns per-run weigh-ins into a sweat rate, then models sweat
// rate against temperature (with an intensity normalisation so easy and hard runs
// are comparable) to estimate fluid + sodium loss in different conditions.
//
// Sweat rate depends on BOTH temperature and how hard you run (metabolic heat ~
// running speed). With only a handful of weighed runs a two-variable regression
// overfits, so instead each observation is normalised to a reference effort
// (marathon pace) before a single-variable temperature regression; predictions
// scale back to whatever effort the caller asks for. Falls back to a plain mean
// when the data is too sparse to fit a slope.

// ── per-run derivations ───────────────────────────────────────

// Gross sweat loss (litres) = body-mass lost + fluid drunk (1 kg ≈ 1 L). Ignores
// respiratory water and glycogen-bound water (~1–2% high) — fine for estimation.
export function sweatLossL(
  beforeKg: number | null,
  afterKg: number | null,
  fluidMl: number | null,
): number | null {
  if (beforeKg == null || afterKg == null) return null;
  const loss = beforeKg - afterKg + (fluidMl ?? 0) / 1000;
  return loss > 0 ? loss : null;
}

// Sweat rate (L/h) from a loss over the moving time. Null without a moving time.
export function sweatRateLh(lossL: number | null, movingSecs: number | null): number | null {
  if (lossL == null || !movingSecs || movingSecs <= 0) return null;
  return lossL / (movingSecs / 3600);
}

// Sodium lost (mg) over a run = sweat loss × the athlete's sweat-sodium concentration.
export function sodiumLossMg(lossL: number, sweatSodiumMgL: number): number {
  return Math.round(lossL * sweatSodiumMgL);
}

// ── intensity normalisation ───────────────────────────────────

// How much harder (or easier) `paceMinKm` is than the reference effort, as a
// speed ratio (running speed = 1/pace). Clamped so a recovery jog or a fast rep
// doesn't distort the model. 1.0 when either pace is unknown (no adjustment).
function intensityFactor(paceMinKm: number | null, refPaceMinKm: number | null): number {
  if (paceMinKm == null || paceMinKm <= 0 || refPaceMinKm == null || refPaceMinKm <= 0) return 1;
  return clamp(refPaceMinKm / paceMinKm, 0.6, 1.6);
}

// ── model ─────────────────────────────────────────────────────

export interface HydrationPoint {
  tempC: number;
  sweatRateLh: number;
  ngpMinKm: number | null;   // effort proxy (grade-adjusted pace)
}

export interface SweatModel {
  kind: 'linear' | 'mean';
  a: number;                 // ref-effort rate at 0 °C (linear) or the mean rate
  b: number;                 // L/h per °C (0 for a mean model)
  n: number;                 // data points used
  spread: number;            // °C range spanned by the data
  r2: number | null;         // fit quality (linear only)
  refPaceMinKm: number | null;
}

// Least-squares fit of y on x. Null if fewer than two points or x has no spread.
export function linreg(pts: { x: number; y: number }[]): { a: number; b: number; r2: number } | null {
  const n = pts.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  for (const p of pts) { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; syy += p.y * p.y; }
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const b = (n * sxy - sx * sy) / denom;
  const a = (sy - b * sx) / n;
  const ssTot = syy - (sy * sy) / n;
  const ssRes = syy - a * sy - b * sxy;
  const r2 = ssTot > 1e-9 ? Math.max(0, 1 - ssRes / ssTot) : 0;
  return { a, b, r2 };
}

// Build the sweat model from weighed runs. Normalises each rate to `refPaceMinKm`
// (marathon effort) first; regresses on temperature when there are ≥3 runs across
// ≥6 °C and the slope is non-negative (heat shouldn't lower sweat), else a mean.
export function buildSweatModel(points: HydrationPoint[], refPaceMinKm: number | null): SweatModel | null {
  const adj = points
    .filter(p => Number.isFinite(p.tempC) && Number.isFinite(p.sweatRateLh) && p.sweatRateLh > 0)
    .map(p => ({ x: p.tempC, y: p.sweatRateLh / intensityFactor(p.ngpMinKm, refPaceMinKm) }));
  const n = adj.length;
  if (n === 0) return null;

  const temps = adj.map(p => p.x);
  const spread = Math.max(...temps) - Math.min(...temps);
  const mean = adj.reduce((s, p) => s + p.y, 0) / n;

  if (n >= 3 && spread >= 6) {
    const fit = linreg(adj);
    if (fit && fit.b >= 0) {
      return { kind: 'linear', a: fit.a, b: fit.b, n, spread, r2: fit.r2, refPaceMinKm };
    }
  }
  return { kind: 'mean', a: mean, b: 0, n, spread, r2: null, refPaceMinKm };
}

// Predicted sweat rate (L/h) at a temperature and effort. Base is the ref-effort
// rate at `tempC`; scaled to `paceMinKm` when supplied (defaults to ref effort).
export function predictSweatRate(model: SweatModel, tempC: number, paceMinKm?: number | null): number {
  const base = model.kind === 'linear' ? clamp(model.a + model.b * tempC, 0.3, 3.0) : model.a;
  return base * intensityFactor(paceMinKm ?? model.refPaceMinKm, model.refPaceMinKm);
}

// ── conditions table + race recommendation ────────────────────

export interface ConditionBucket {
  tempC: number;
  sweatRateLh: number;   // at marathon effort
  fluidLossMlPerH: number;
  sodiumMgPerH: number;
  isRace?: boolean;      // the live race-forecast bucket
}

export const DEFAULT_BUCKET_TEMPS = [10, 15, 20, 25, 30];

// Estimated fluid + sodium loss per typical condition, at marathon effort. When a
// race-forecast temp is given it's merged in (deduped, flagged) and sorted.
export function conditionBuckets(
  model: SweatModel,
  sweatSodiumMgL: number,
  raceTempC?: number | null,
): ConditionBucket[] {
  const temps = new Map<number, boolean>();       // temp → isRace
  for (const t of DEFAULT_BUCKET_TEMPS) temps.set(t, false);
  if (raceTempC != null && Number.isFinite(raceTempC)) temps.set(Math.round(raceTempC), true);
  return [...temps.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([tempC, isRace]) => {
      const rate = predictSweatRate(model, tempC);
      return {
        tempC,
        sweatRateLh: round2(rate),
        fluidLossMlPerH: round10(rate * 1000),
        sodiumMgPerH: round10(rate * sweatSodiumMgL),
        isRace,
      };
    });
}

export interface FluidRecommendation {
  fluidMlPerH: [number, number];
  sodiumMgPerH: number;
  rateLh: number;
}

export interface FluidRecOpts { replaceLo: number; replaceHi: number; gutCapMl: number; floorMl: number; }
export const DEFAULT_FLUID_OPTS: FluidRecOpts = { replaceLo: 0.6, replaceHi: 0.8, gutCapMl: 800, floorMl: 350 };

// Race fluid + sodium target from the athlete's sweat model at the race temp and
// marathon effort. You replace 60–80% of losses (not 100%), floored/capped for
// gut tolerance. Null when there's no model → caller keeps its generic default.
export function raceFluidRecommendation(
  model: SweatModel | null,
  tempC: number,
  sweatSodiumMgL: number,
  marathonPaceMinKm: number | null,
  opts: FluidRecOpts = DEFAULT_FLUID_OPTS,
): FluidRecommendation | null {
  if (!model) return null;
  const rate = predictSweatRate(model, tempC, marathonPaceMinKm);   // L/h
  const lo = clamp(round10(rate * 1000 * opts.replaceLo), opts.floorMl, opts.gutCapMl);
  const hi = clamp(round10(rate * 1000 * opts.replaceHi), opts.floorMl, opts.gutCapMl);
  return {
    fluidMlPerH: [Math.min(lo, hi), Math.max(lo, hi)],
    sodiumMgPerH: round10(rate * sweatSodiumMgL * opts.replaceHi),
    rateLh: round2(rate),
  };
}

// A short confidence descriptor for the benchmarks card / race note.
export function modelConfidence(model: SweatModel | null): { label: string; detail: string } {
  if (!model) return { label: 'No data', detail: 'Weigh yourself before & after a run to start estimating.' };
  if (model.kind === 'linear') {
    return {
      label: 'Temperature-adjusted',
      detail: `From ${model.n} weighed runs across ${Math.round(model.spread)} °C (R² ${model.r2!.toFixed(2)}).`,
    };
  }
  return {
    label: 'Early estimate',
    detail: `From ${model.n} weighed run${model.n === 1 ? '' : 's'} — not yet temperature-adjusted; weigh runs across a range of conditions to refine.`,
  };
}

// ── small helpers ─────────────────────────────────────────────
function clamp(x: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, x)); }
function round10(x: number): number { return Math.round(x / 10) * 10; }
function round2(x: number): number { return Math.round(x * 100) / 100; }
