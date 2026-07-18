// Daily calorie-target estimate (dashboard "Today" tile). Pure & algorithmic — no
// AI calls. The target is a maintenance base (entered BMR × a daily-living activity
// factor) PLUS the calories from the day's PLANNED exercise, so the athlete has a
// number to eat toward.
//
// Exercise energy uses METs (metabolic equivalents): a session burns roughly
// MET × bodyweight(kg) × hours. We take the NET cost (MET − 1) so we don't
// double-count the resting calories the base already covers during that hour.

import { resolveSport, type SportKey } from '@/lib/sports/registry';

// A session's shape as far as the estimate cares — a structural subset of the
// dashboard's PlanSession, so callers can pass their rows straight in.
export interface EnergySession {
  session_type?: string | null;
  activity_type?: string | null;
  intensity?: string | null;
  estimated_duration?: string | null;   // "H:MM"
  distance_km?: number | null;
  status?: string | null;
  // Logged actuals — present once the session is completed. They override the plan
  // so the target reflects what was actually done (ran longer/shorter than planned).
  actualDurationMins?: number | null;
  actualDistanceKm?: number | null;
}

export interface CalorieTarget {
  base: number;        // round(bmr × activityFactor); 0 when BMR unset
  exercise: number;    // summed net exercise kcal; 0 when no weight or no sessions
  total: number;       // base + exercise
  hasBmr: boolean;
  hasWeight: boolean;
}

export const DEFAULT_ACTIVITY_FACTOR = 1.3;

// Gross energy cost of running per kg per km (~pace-independent). Used by the
// calorie-calibration check as the ground-truth "actual" for runs.
export const RUN_GROSS_KCAL_PER_KG_KM = 1.036;

// METs by sport × intensity band. Approximate Compendium-of-Physical-Activities
// values; the intensity keys are the real values stored on plan_sessions
// (recovery/easy/steady/tempo/hard/race/mobility/null). Strength & yoga are flat
// (intensity doesn't map to them meaningfully).
type Band = 'recovery' | 'easy' | 'steady' | 'tempo' | 'hard' | 'race';
// Recalibrated 2026-07 against ground truth (power for rides, distance-cost for
// runs), which showed the previous run values ~45% low and cycling ~30% low for a
// trained athlete. The calorie_samples table records predicted-vs-actual for each
// to-plan session so these can be tuned further from data over time.
const MET: Record<SportKey, Record<Band, number> | number> = {
  run:      { recovery: 9.0, easy: 11.0, steady: 12.5, tempo: 13.8, hard: 15.0, race: 16.0 },
  cycling:  { recovery: 5.5, easy: 7.5,  steady: 9.0,  tempo: 10.5, hard: 12.0, race: 13.0 },
  swimming: { recovery: 5.5, easy: 7.0,  steady: 8.3,  tempo: 9.5,  hard: 10.5, race: 11.0 },
  strength: 4.5,
  yoga:     2.6,
};
const DEFAULT_MET = 7.0;

// Nominal speed (km/h) to recover a duration for a run/ride session that has no
// estimated_duration — keyed loosely by intensity. Rough but only a fallback.
const RUN_KMH: Record<Band, number> = { recovery: 9, easy: 10.5, steady: 12, tempo: 13.5, hard: 15, race: 15.5 };
const RIDE_KMH: Record<Band, number> = { recovery: 22, easy: 26, steady: 30, tempo: 33, hard: 36, race: 38 };

function bandOf(intensity: string | null | undefined): Band {
  switch (intensity) {
    case 'recovery': case 'easy': case 'steady': case 'tempo': case 'hard': case 'race':
      return intensity;
    case 'mobility': return 'recovery';
    default: return 'easy';
  }
}

function metFor(sport: SportKey, band: Band): number {
  const table = MET[sport];
  return typeof table === 'number' ? table : (table[band] ?? DEFAULT_MET);
}

// The gross MET for a session's sport × intensity — used by the calorie-calibration
// check to compare a plan prediction against a ground-truth actual.
export function sessionMet(session: EnergySession): number {
  return metFor(resolveSport(session), bandOf(session.intensity));
}

// "H:MM" (or "MM") → hours. Returns null when unparseable/empty.
export function durationToHours(d: string | null | undefined): number | null {
  if (!d) return null;
  const parts = d.split(':').map(p => Number(p.trim()));
  if (parts.some(n => !Number.isFinite(n))) return null;
  const [h, m] = parts.length >= 2 ? parts : [0, parts[0]];
  const hours = h + m / 60;
  return hours > 0 ? hours : null;
}

// Net exercise kcal for a single planned session. Needs bodyweight; returns 0 when
// weight is missing or no duration can be derived.
export function sessionKcal(session: EnergySession, weightKg: number | null): number {
  if (!weightKg || weightKg <= 0) return 0;
  const sport = resolveSport(session);
  const band = bandOf(session.intensity);

  // Prefer the logged actual duration once the session is done; else the plan.
  let hours = session.actualDurationMins != null && session.actualDurationMins > 0
    ? session.actualDurationMins / 60
    : durationToHours(session.estimated_duration);
  if (hours == null) {
    // Fallback: derive from distance (actual if logged, else planned) for run/ride;
    // a small default for strength/yoga; otherwise no contribution.
    const km = session.actualDistanceKm ?? (session.distance_km != null ? Number(session.distance_km) : null);
    if ((sport === 'run' || sport === 'cycling') && km && km > 0) {
      hours = km / (sport === 'run' ? RUN_KMH[band] : RIDE_KMH[band]);
    } else if (sport === 'strength' || sport === 'yoga') {
      hours = 0.75;
    } else {
      return 0;
    }
  }

  const netMet = Math.max(0, metFor(sport, band) - 1);   // net of resting
  return netMet * weightKg * hours;
}

// A per-session calorie label for the activity rows/heroes: the actual burn once
// the session is completed (a real duration/distance is logged), otherwise the
// estimate off the plan (prefixed "≈"). Null when there's no weight or the estimate
// is zero. `completed` carries the logged actuals (mins / distanceKm) when done.
export function kcalLabel(
  session: EnergySession,
  completed: { mins?: number | null; distanceKm?: number | null } | null | undefined,
  weightKg: number | null,
): string | null {
  if (!weightKg || weightKg <= 0) return null;
  const done = !!completed && (completed.mins != null || completed.distanceKm != null);
  const s = done ? { ...session, actualDurationMins: completed!.mins ?? null, actualDistanceKm: completed!.distanceKm ?? null } : session;
  const k = Math.round(sessionKcal(s, weightKg));
  if (!(k > 0)) return null;
  return `${done ? '' : '≈ '}${k.toLocaleString('en-GB')} kcal`;
}

// The day's calorie target. `sessions` should be today's non-rest sessions; rest
// rows are filtered here defensively too.
export function dailyCalorieTarget(opts: {
  bmr: number | null;
  activityFactor: number;
  weightKg: number | null;
  sessions: EnergySession[];
}): CalorieTarget {
  const { bmr, activityFactor, weightKg, sessions } = opts;
  const hasBmr = bmr != null && bmr > 0;
  const hasWeight = weightKg != null && weightKg > 0;

  const base = hasBmr ? Math.round(bmr! * (activityFactor > 0 ? activityFactor : DEFAULT_ACTIVITY_FACTOR)) : 0;
  const exercise = hasWeight
    ? Math.round(sessions.filter(s => s.status !== 'rest').reduce((sum, s) => sum + sessionKcal(s, weightKg), 0))
    : 0;

  return { base, exercise, total: base + exercise, hasBmr, hasWeight };
}
