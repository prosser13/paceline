-- Track the intervals.icu calendar event created for a planned run, so the rolling
-- Garmin workout sync can update or delete the right event on subsequent runs.
-- intervals_event_id is the intervals.icu event id; intervals_synced_at is when we
-- last pushed the workout text (used to detect stale/changed structures).
ALTER TABLE plan_sessions ADD COLUMN IF NOT EXISTS intervals_event_id text;
ALTER TABLE plan_sessions ADD COLUMN IF NOT EXISTS intervals_synced_at timestamptz;
