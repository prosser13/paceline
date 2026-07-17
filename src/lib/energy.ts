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
}

export interface CalorieTarget {
  base: number;        // round(bmr × activityFactor); 0 when BMR unset
  exercise: number;    // summed net exercise kcal; 0 when no weight or no sessions
  total: number;       // base + exercise
  hasBmr: boolean;
  hasWeight: boolean;
}

export const DEFAULT_ACTIVITY_FACTOR = 1.3;

// METs by sport × intensity band. Approximate Compendium-of-Physical-Activities
// values; the intensity keys are the real values stored on plan_sessions
// (recovery/easy/steady/tempo/hard/race/mobility/null). Strength & yoga are flat
// (intensity doesn't map to them meaningfully).
type Band = 'recovery' | 'easy' | 'steady' | 'tempo' | 'hard' | 'race';
const MET: Record<SportKey, Record<Band, number> | number> = {
  run:      { recovery: 7.0, easy: 8.5, steady: 9.8, tempo: 11.0, hard: 12.8, race: 13.3 },
  cycling:  { recovery: 4.5, easy: 6.0, steady: 8.0, tempo: 10.0, hard: 11.5, race: 12.0 },
  swimming: { recovery: 5.5, easy: 7.0, steady: 8.3, tempo: 9.5,  hard: 10.5, race: 11.0 },
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

  let hours = durationToHours(session.estimated_duration);
  if (hours == null) {
    // Fallback: derive from planned distance for run/ride; a small default for
    // strength/yoga; otherwise no contribution.
    const km = session.distance_km != null ? Number(session.distance_km) : null;
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
