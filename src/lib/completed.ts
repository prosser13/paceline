// Builds the rich "completion" object (drives the run/ride hero + row actuals,
// profile colouring and compare table) from a raw completed_workouts row. The
// dashboard (_dashboard/data.ts) and the plan page (plan/data.ts) built this
// identically inline — this is the single home so the TSS + duration logic lives
// once. TSS comes from the shared sessionTss (run NGP/pace vs threshold, else ride
// power vs FTP).
//
// Note: the plan page's row components (RunRow/CyclingRow) currently expect a
// `durationMins` field rather than `mins`. The plan boundary adapts the name; the
// row-prop rename is deliberately deferred to keep this extraction low-risk.

import { parseThresholdPace, sessionTss } from '@/lib/run-tss';

export interface CompletedActuals {
  durationStr: string;
  mins: number | null;
  tss: number | null;
  distanceKm: number | null;
  avgHr: number | null;
  avgPower: number | null;   // rides only
  segmentActuals: (number | null)[] | null;
  segmentHr: (number | null)[] | null;
  perceivedEffort: number | null;   // Garmin RPE (1–10) from intervals.icu, when logged
  // Long-run quality — computed at Strava sync, stored on the row. Null when not a
  // long run / streams insufficient. Drives the LongRunQuality detail block.
  decouplingPct: number | null;
  paceDecayPct: number | null;
  fuelCarbsPerH: number | null;
}

export interface CompletedRow {
  actual_duration_mins?: number | string | null;
  actual_duration_secs?: number | string | null;   // precise moving time; preferred over the minute-rounded mins
  actual_avg_pace_min_km?: number | string | null;
  actual_avg_power?: number | string | null;
  actual_ngp_min_km?: number | string | null;
  actual_distance_km?: number | string | null;
  actual_avg_hr?: number | string | null;
  segment_actuals?: unknown;
  segment_hr?: unknown;
  tss?: number | string | null;   // stored (recomputed on threshold/FTP change); null → compute live
  perceived_effort?: number | string | null;
  decoupling_pct?: number | string | null;
  pace_decay_pct?: number | string | null;
  fuel_carbs_per_h?: number | string | null;
}

export function buildCompletedActuals(cw: CompletedRow, threshMinKm: number, ftp: number | null): CompletedActuals {
  // Prefer the precise moving-time seconds; `actual_duration_mins` is numeric(6,1)
  // so it can only ever hold whole/tenth minutes (a 34:02 race stores as 34.0),
  // which is why the displayed time used to round to 34:00. Fall back to minutes
  // for rows synced before the seconds column existed / non-Strava completions.
  const rawMins = cw.actual_duration_mins != null ? Number(cw.actual_duration_mins) : null;
  const secs = cw.actual_duration_secs != null ? Number(cw.actual_duration_secs)
    : (rawMins != null ? Math.round(rawMins * 60) : null);
  const mins = secs != null ? secs / 60 : rawMins;
  const pace = cw.actual_avg_pace_min_km ? Number(cw.actual_avg_pace_min_km) : null;
  const ngp  = cw.actual_ngp_min_km != null ? Number(cw.actual_ngp_min_km) : null;
  const avgPower = cw.actual_avg_power != null ? Number(cw.actual_avg_power) : null;
  // "H:MM:SS" (seconds preserved) — humanHMM renders it as "34:02" / "1:07:00".
  const durationStr = secs != null
    ? `${Math.floor(secs / 3600)}:${String(Math.floor((secs % 3600) / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
    : '';
  // Prefer the stored TSS (kept fresh by recomputeAllCompletedTss); fall back to a
  // live calc when null (e.g. a row synced before this column, or pending NGP).
  // Run TSS uses NGP (grade-adjusted rTSS) when present, else average pace.
  const tss = cw.tss != null ? Number(cw.tss) : sessionTss({ mins, runPace: ngp ?? pace, power: avgPower }, threshMinKm, ftp);
  return {
    durationStr, mins, tss,
    distanceKm: cw.actual_distance_km ? Number(cw.actual_distance_km) : null,
    avgHr: cw.actual_avg_hr != null ? Number(cw.actual_avg_hr) : null,
    avgPower,
    segmentActuals: (cw.segment_actuals as (number | null)[] | null) ?? null,
    segmentHr: (cw.segment_hr as (number | null)[] | null) ?? null,
    perceivedEffort: cw.perceived_effort != null ? Number(cw.perceived_effort) : null,
    decouplingPct: cw.decoupling_pct != null ? Number(cw.decoupling_pct) : null,
    paceDecayPct: cw.pace_decay_pct != null ? Number(cw.pace_decay_pct) : null,
    fuelCarbsPerH: cw.fuel_carbs_per_h != null ? Number(cw.fuel_carbs_per_h) : null,
  };
}

// Keyed by plan_session_id (the plan page's lookup). Rows without a
// plan_session_id (orphaned completions) are skipped.
export function buildCompletedMap(
  rows: (CompletedRow & { plan_session_id?: string | null })[],
  threshMinKm: number,
  ftp: number | null,
): Record<string, CompletedActuals> {
  const map: Record<string, CompletedActuals> = {};
  for (const cw of rows) {
    if (!cw.plan_session_id) continue;
    map[cw.plan_session_id] = buildCompletedActuals(cw, threshMinKm, ftp);
  }
  return map;
}

// Convenience: parse the threshold-pace string straight to min/km, re-exported so
// callers building completions don't reach into run-tss directly.
export { parseThresholdPace };
