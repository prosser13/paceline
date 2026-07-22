// Projects Fitness (CTL) / Fatigue (ATL) / Form (TSB) forward from today's
// values through the planned training load to a target (race) date — the same
// exponentially-weighted model intervals.icu / TrainingPeaks use. Lets a race
// page show *predicted* race-morning readiness rather than today's.
//
// CTL/ATL are EWMAs of daily TSS with time constants of 42 and 7 days. During a
// taper the fast ATL decays away while the slow CTL holds, so Form rises into
// the race — which is exactly what this surfaces.

import { addDaysISO as addDays } from '@/lib/dates';

export interface ProjectionPoint {
  date: string; // yyyy-mm-dd
  ctl: number;  // fitness
  atl: number;  // fatigue
}

const CTL_TC = 42;
const ATL_TC = 7;
const CTL_LAMBDA = 1 - Math.exp(-1 / CTL_TC);
const ATL_LAMBDA = 1 - Math.exp(-1 / ATL_TC);

/**
 * Roll CTL/ATL forward day by day from `seed` (today's values) to `raceDate`,
 * applying each day's planned TSS (0 on rest/strength days). The race day itself
 * carries the values in WITHOUT applying the race's own load — the point of
 * interest is the readiness you arrive with, not your state after finishing.
 * Returns one point per day starting at `fromDate` (the seed) so the series
 * connects cleanly to the historical trend.
 */
export function projectFitness(
  seed: { fitness: number; fatigue: number },
  plannedTss: { date: string; tss: number }[],
  fromDate: string,
  raceDate: string,
): ProjectionPoint[] {
  const tssByDate = new Map(plannedTss.map(p => [p.date, p.tss]));

  let ctl = seed.fitness;
  let atl = seed.fatigue;

  const points: ProjectionPoint[] = [{ date: fromDate, ctl, atl }];

  let cursor = fromDate;
  // Guard against a malformed/absent race date producing a runaway loop.
  for (let i = 0; i < 400; i++) {
    const next = addDays(cursor, 1);
    if (next > raceDate) break;
    cursor = next;
    // Apply training load only for days before the race; race morning inherits
    // the carried-in values (form = CTL/ATL at the end of the last training day).
    if (cursor < raceDate) {
      const tss = tssByDate.get(cursor) ?? 0;
      ctl = ctl + (tss - ctl) * CTL_LAMBDA;
      atl = atl + (tss - atl) * ATL_LAMBDA;
    }
    points.push({ date: cursor, ctl, atl });
  }

  return points;
}

export interface RaceDayReadiness {
  fitness: number;
  fatigue: number;
  form: number;
  /** Short readiness verdict from the predicted form (TSB). */
  verdict: string;
}

export function readinessFromProjection(points: ProjectionPoint[]): RaceDayReadiness | null {
  const last = points[points.length - 1];
  if (!last) return null;
  const fitness = Math.round(last.ctl);
  const fatigue = Math.round(last.atl);
  const form = Math.round(last.ctl - last.atl);

  let verdict: string;
  if (form > 20) verdict = 'Very fresh — possibly over-tapered';
  else if (form >= 5) verdict = 'Race-ready — well rested and sharp';
  else if (form >= -10) verdict = 'Slightly fatigued — a touch more taper would help';
  else verdict = 'Carrying fatigue — ease off to arrive fresh';

  return { fitness, fatigue, form, verdict };
}
