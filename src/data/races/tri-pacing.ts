// Estimated triathlon split + finish from the athlete's fitness — NOT a goal-based
// pacing plan. Each leg's time is projected from the relevant threshold (swim CSS,
// bike FTP, run threshold pace), transitions are fixed estimates, and the cumulative
// clock gives an estimated finish. Everything here is clearly an ESTIMATE the guide
// labels as such; the athlete has set no goal.

import type { RaceGuide, Discipline } from './types';

export interface TriFitness {
  swimCssSec: number | null;        // Critical Swim Speed, sec/100 m
  ftpW: number | null;              // cycling FTP, watts
  runThresholdMinKm: number | null; // running threshold pace, min/km
}

export interface TriRow {
  kind: 'swim' | 'bike' | 'run' | 'T1' | 'T2';
  name: string;
  distanceKm: number | null;
  estSeconds: number | null;
  detail: string | null;            // the assumption, e.g. "@ 1:53/100m" / "~205 W · 30 km/h"
  cumSeconds: number | null;        // cumulative elapsed at the end of this row
}

export interface TriEstimate {
  rows: TriRow[];
  finishSeconds: number | null;     // null when any leg's fitness input is missing
  missing: string[];                // which inputs are absent (for the "set X" hint)
}

// "m:ss" from seconds.
function mss(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// 1.9 km race swim pace ≈ CSS + a small tax over pool CSS (mass start, sighting, no
// wall push; a wetsuit offsets some of it). Sheltered dock/flat water sits at the low
// end — open sea would be higher.
const OW_TAX_SEC_PER_100 = 4;

// Bike: a 70.3 is ridden at ~72% of FTP (normalised). A calibrated flat-road speed
// curve (≈ 3.88·P^0.40 km/h: 200 W→32, 250 W→35, 300 W→38), then a climbing haircut
// scaled by metres-of-ascent per km (a hilly course like Swansea's ~12 m/km costs
// ~15%). Rough but honest — a real power model would need CdA/mass.
const TRI_BIKE_FTP_FRACTION = 0.72;
function bikeSpeedKmh(np: number, ascentPerKm: number): number {
  const flat = 3.88 * Math.pow(np, 0.40);
  const haircut = Math.min(0.20, ascentPerKm * 0.012);
  return flat * (1 - haircut);
}

// Run: a 70.3 half-marathon off the bike ≈ threshold pace + a fatigue tax (~12%).
const TRI_RUN_FATIGUE = 1.12;

function legEstimate(d: Discipline, fit: TriFitness): { est: number | null; detail: string | null; missing?: string } {
  if (d.sport === 'swim') {
    if (fit.swimCssSec == null) return { est: null, detail: null, missing: 'swim CSS' };
    const pacePer100 = fit.swimCssSec + OW_TAX_SEC_PER_100;
    return { est: Math.round(pacePer100 * d.distanceKm * 10), detail: `@ ${mss(pacePer100)}/100m (CSS + race tax)` };
  }
  if (d.sport === 'bike') {
    if (fit.ftpW == null) return { est: null, detail: null, missing: 'bike FTP' };
    const np = Math.round(fit.ftpW * TRI_BIKE_FTP_FRACTION);
    const ascentPerKm = (d.ascentM ?? 0) / Math.max(1, d.distanceKm);
    const speed = bikeSpeedKmh(np, ascentPerKm);
    return { est: Math.round((d.distanceKm / speed) * 3600), detail: `~${np} W · ${speed.toFixed(1)} km/h (${d.ascentM ?? 0} m climb)` };
  }
  // run
  if (fit.runThresholdMinKm == null) return { est: null, detail: null, missing: 'run threshold' };
  const paceMinKm = fit.runThresholdMinKm * TRI_RUN_FATIGUE;
  return { est: Math.round(paceMinKm * 60 * d.distanceKm), detail: `@ ${mss(paceMinKm * 60)}/km (off the bike)` };
}

export function buildTriEstimate(guide: RaceGuide, fit: TriFitness): TriEstimate {
  const disciplines = guide.disciplines ?? [];
  const transitions = guide.transitions ?? [];
  const rows: TriRow[] = [];
  const missing: string[] = [];
  let cum = 0;
  let anyNull = false;

  disciplines.forEach((d, i) => {
    const { est, detail, missing: miss } = legEstimate(d, fit);
    if (miss) { missing.push(miss); anyNull = true; }
    if (est != null) cum += est;
    rows.push({
      kind: d.sport, name: d.name, distanceKm: d.distanceKm,
      estSeconds: est, detail, cumSeconds: est != null && !anyNull ? cum : null,
    });
    // Insert the transition that follows this leg (T1 after swim, T2 after bike).
    const t = transitions[i];
    if (t && i < disciplines.length - 1) {
      cum += t.estSeconds;
      rows.push({ kind: t.kind, name: t.name, distanceKm: null, estSeconds: t.estSeconds, detail: t.note ?? null, cumSeconds: !anyNull ? cum : null });
    }
  });

  return { rows, finishSeconds: anyNull ? null : cum, missing: [...new Set(missing)] };
}
