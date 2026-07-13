// Derives a checkpoint-by-checkpoint pacing schedule from a target finish time.
// Time is distributed across legs by "effort distance" (flat km plus a climb
// penalty) so the climby back half is allotted proportionally more time than a
// naive even split — then each leg's arrival is checked against its cut-off.

import type { RaceGuide } from './types';

export interface PacingRow {
  name: string;
  distanceKm: number;
  /** Cumulative target elapsed, e.g. "2:41". */
  cumElapsed: string;
  /** Target time-of-day arrival, 12-hour, e.g. "10:11 AM". */
  arrival: string;
  /** This leg's pace, min/km, e.g. "6:12". null at the start. */
  legPace: string | null;
  /** Metres of ascent on this leg. 0 at the start. */
  legClimbM: number;
  /** Metres of descent on this leg. 0 at the start. */
  legDescentM: number;
  dropBag: boolean;
}

// 100 m of climb ≈ 1 km of flat effort.
const CLIMB_PENALTY_PER_M = 0.01;

function toSeconds(hhmm: string): number {
  const [h, m, s] = hhmm.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

// "M:SS" pace per km → seconds. Null on a malformed value.
function paceToSeconds(pace: string): number | null {
  const [m, s] = pace.split(':').map(Number);
  return Number.isFinite(m) && Number.isFinite(s) ? m * 60 + s : null;
}

// Display a target time, dropping a leading zero-hours part so a sub-hour race
// stored as "0:33:59" reads as "33:59" (while "2:39:40" / "7:30" pass through).
export function formatTargetTime(t: string): string {
  const parts = t.split(':');
  if (parts.length === 3 && Number(parts[0]) === 0) return `${Number(parts[1])}:${parts[2]}`;
  return t;
}

// Time-of-day as 12-hour with AM/PM. Rounds to the minute first so 11:59:40
// reads "12:00 PM", not "11:60 AM", and wraps past midnight (00:00 → 12:00 AM).
function clock(totalSec: number): string {
  const mins = Math.round(totalSec / 60);
  const s = ((mins * 60) % 86400 + 86400) % 86400;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// Elapsed duration "H:MM" — round to the minute to avoid a 60-minute overflow.
function elapsed(totalSec: number): string {
  const mins = Math.round(totalSec / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function paceMinKm(legSec: number, legKm: number): string {
  if (legKm <= 0) return '—';
  const sPerKm = legSec / legKm;
  const m = Math.floor(sPerKm / 60);
  const s = Math.round(sPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function buildPacing(guide: RaceGuide, targetTime: string): PacingRow[] {
  const cps = guide.checkpoints;
  const startSec = toSeconds(guide.startTime);
  const targetSec = toSeconds(targetTime);

  // Flat pacing: when the guide sets `pacingFlatPace`, every leg runs at that even
  // pace (the elapsed clock ignores the target and just accrues at the flat pace).
  // Otherwise time is distributed by climb-weighted effort across the target.
  const flatSecPerKm = guide.pacingFlatPace ? paceToSeconds(guide.pacingFlatPace) : null;

  // Effort distance per leg, and the total, for proportional time allocation.
  const legEffort: number[] = [0];
  let totalEffort = 0;
  for (let i = 1; i < cps.length; i++) {
    const legKm = cps[i].distanceKm - cps[i - 1].distanceKm;
    const legClimb = Math.max(0, (cps[i].ascentM ?? 0) - (cps[i - 1].ascentM ?? 0));
    const effort = legKm + legClimb * CLIMB_PENALTY_PER_M;
    legEffort.push(effort);
    totalEffort += effort;
  }

  const rows: PacingRow[] = [];
  let cumSec = 0;
  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i];
    let legPace: string | null = null;
    let legClimbM = 0;
    let legDescentM = 0;
    if (i > 0) {
      const legKm = cp.distanceKm - cps[i - 1].distanceKm;
      const legSec = flatSecPerKm != null
        ? legKm * flatSecPerKm
        : (legEffort[i] / totalEffort) * targetSec;
      cumSec += legSec;
      legPace = paceMinKm(legSec, legKm);
      legClimbM = Math.max(0, (cp.ascentM ?? 0) - (cps[i - 1].ascentM ?? 0));
      legDescentM = Math.max(0, (cp.descentM ?? 0) - (cps[i - 1].descentM ?? 0));
    }

    rows.push({
      name: cp.name,
      distanceKm: cp.distanceKm,
      cumElapsed: elapsed(cumSec),
      arrival: clock(startSec + cumSec),
      legPace,
      legClimbM,
      legDescentM,
      dropBag: !!cp.dropBag,
    });
  }

  return rows;
}
