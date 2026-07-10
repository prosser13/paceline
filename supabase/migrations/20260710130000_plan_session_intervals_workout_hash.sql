-- Hash of the emitted intervals.icu workout text for a planned run. The sync
-- re-pushes only when this changes, so any plan edit propagates to intervals.icu
-- and the two never drift, without re-pushing unchanged workouts every run.
ALTER TABLE plan_sessions ADD COLUMN IF NOT EXISTS intervals_workout_hash text;
