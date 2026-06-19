-- Per-segment actual pacing, derived from Strava streams at sync time.
-- Array of actual pace (seconds per km) per planned segment, in expanded order
-- (repeats unrolled). Null entries = segment fell beyond the actual run distance.
ALTER TABLE completed_workouts
  ADD COLUMN IF NOT EXISTS segment_actuals jsonb;
