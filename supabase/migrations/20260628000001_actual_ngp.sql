-- Normalized Graded Pace for grade-adjusted run TSS (rTSS).
alter table completed_workouts
  add column if not exists actual_ngp_min_km numeric;

comment on column completed_workouts.actual_ngp_min_km is
  'Normalized Graded Pace (min/km) computed from the Strava velocity + altitude streams during sync. Drives grade-adjusted rTSS for runs (rTSS = hours x (threshold_pace / NGP)^2 x 100). Null = not yet computed (no altitude stream, or pending backfill); TSS then falls back to average pace.';
