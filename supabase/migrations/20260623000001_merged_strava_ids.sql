-- Merge feature: a completion can absorb extra Strava activities (e.g. a ride
-- that Strava split into two). The absorbed activities' ids are recorded here so
-- they're excluded from the off-plan list and the merge can be undone.
ALTER TABLE completed_workouts
  ADD COLUMN IF NOT EXISTS merged_strava_ids bigint[] NOT NULL DEFAULT '{}';
