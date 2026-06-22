// Derives a checkpoint-by-checkpoint pacing schedule from a target finish time.
// Time is distributed across legs by "effort distance" (flat km plus a climb
// penalty) so the climby back half is allotted proportionally more time than a
// naive even split — then each leg's arrival is checked against its cut-off.

import type { RaceGuide } from './types';

export interface PacingRow {
  name: string;
  distanceMi: number;
  /** Cumulative target elapsed, e.g. "2:41". */
  cumElapsed: string;
  /** Target time-of-day arrival, 12-hour, e.g. "10:11 AM". */
  arrival: string;
  /** This leg's pace, min/km, e.g. "6:12". null at the start. */
  legPace: string | null;
  /** Official cut-off, 12-hour, e.g. "2:00 PM", or null. */
  cutoff: string | null;
  /** Minutes of margin vs cut-off (negative = behind). null when no cut-off. */
  marginMin: number | null;
  dropBag: boolean;
}

const MI_TO_KM = 1.609344;
// 100 m of climb ≈ 1 km of flat effort.
const CLIMB_PENALTY_PER_M = 0.01;

function toSeconds(hhmm: string): number {
  const [h, m, s] = hhmm.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
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

  // Effort distance per leg, and the total, for proportional time allocation.
  const legEffort: number[] = [0];
  let totalEffort = 0;
  for (let i = 1; i < cps.length; i++) {
    const legKm = (cps[i].distanceMi - cps[i - 1].distanceMi) * MI_TO_KM;
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
    if (i > 0) {
      const legSec = (legEffort[i] / totalEffort) * targetSec;
      cumSec += legSec;
      const legKm = (cp.distanceMi - cps[i - 1].distanceMi) * MI_TO_KM;
      legPace = paceMinKm(legSec, legKm);
    }

    let marginMin: number | null = null;
    if (cp.cutoff) {
      let cutoffSec = toSeconds(cp.cutoff) - startSec;
      if (cutoffSec < 0) cutoffSec += 86400; // past-midnight cut-off
      marginMin = Math.round((cutoffSec - cumSec) / 60);
    }

    rows.push({
      name: cp.name,
      distanceMi: cp.distanceMi,
      cumElapsed: elapsed(cumSec),
      arrival: clock(startSec + cumSec),
      legPace,
      cutoff: cp.cutoff ? clock(toSeconds(cp.cutoff)) : null,
      marginMin,
      dropBag: !!cp.dropBag,
    });
  }

  return rows;
}
