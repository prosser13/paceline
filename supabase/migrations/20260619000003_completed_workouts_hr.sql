-- Heart-rate actuals on completed workouts: overall average + per-segment
-- average HR (array aligned to expanded planned segments, like segment_actuals).
ALTER TABLE completed_workouts
  ADD COLUMN IF NOT EXISTS actual_avg_hr integer,
  ADD COLUMN IF NOT EXISTS segment_hr    jsonb;
