-- Elapsed (wall-clock) finish time for completions. Used as the finish time for RACE
-- sessions — moving time undercounts a race (aid stations, stops). actual_duration_secs
-- stays moving time for training-load (TSS) and non-race display.
-- Documentation copy; applied live via the Supabase MCP (see docs/architecture.md §8).
ALTER TABLE completed_workouts ADD COLUMN IF NOT EXISTS actual_elapsed_secs integer;
COMMENT ON COLUMN completed_workouts.actual_elapsed_secs IS 'Elapsed time in seconds (Strava elapsed_time). Used as the finish time for RACE sessions; actual_duration_secs remains moving time for training-load and non-race display.';

-- Backfill from the stored Strava payload where available (idempotent).
UPDATE completed_workouts cw
SET actual_elapsed_secs = (a.raw_data->>'elapsed_time')::int
FROM activities a
WHERE a.strava_activity_id = cw.strava_activity_id
  AND cw.actual_elapsed_secs IS NULL
  AND a.raw_data ? 'elapsed_time';
