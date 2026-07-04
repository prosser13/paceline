// Readiness — a simple, transparent "how will I feel today" score derived from
// intervals.icu wellness. NOT a go/no-go gate: the athlete follows the plan
// regardless; this just sets expectation.
//
// Model (documented on purpose so it's tunable, not a black box):
//   start from 75, move with Form (TSB — the freshness signal), and shave a
//   little when acute fatigue (ATL) is running well above fitness (CTL):
//     score = 75 + 0.7·form − 0.15·max(0, fatigue − fitness)   (clamped 0–100)
//   e.g. form −16, fitness 45, fatigue 61 → 75 −11.2 −2.4 ≈ 61 → "Steady".
//
// Bands: ≥80 Primed · 60–79 Steady · 40–59 Workable · <40 Tired.

export type ReadinessBand = 'Primed' | 'Steady' | 'Workable' | 'Tired';

export interface Readiness {
  score: number;          // 0–100
  band: ReadinessBand;
  line: string;           // one-line "what to expect"
}

const LINE: Record<ReadinessBand, string> = {
  Primed:   'Fully recovered — a good day to go hard if the plan calls for it.',
  Steady:   'Legs should feel decent — today’s load is well-timed.',
  Workable: 'Carrying some fatigue — keep the easy work genuinely easy.',
  Tired:    'Heavily fatigued — prioritise recovery and ease back if it lingers.',
};

// Score → band. Exported so callers that adjust the score (e.g. the recovery-aware
// readiness tile) can re-band without re-deriving from form/fitness/fatigue.
export function readinessBand(score: number): ReadinessBand {
  return score >= 80 ? 'Primed' : score >= 60 ? 'Steady' : score >= 40 ? 'Workable' : 'Tired';
}

export function readinessFrom(
  form: number | null | undefined,
  fitness: number | null | undefined,
  fatigue: number | null | undefined,
): Readiness | null {
  if (form == null) return null;
  const ctl = fitness ?? 0;
  const atl = fatigue ?? 0;
  const raw = 75 + 0.7 * form - 0.15 * Math.max(0, atl - ctl);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const band = readinessBand(score);
  return { score, band, line: LINE[band] };
}
