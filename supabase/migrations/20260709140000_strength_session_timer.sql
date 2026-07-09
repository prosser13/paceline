-- Persistent session timer for the strength builder: timer_started_at is the start
-- of the current running segment (null when paused or stopped); timer_accum_secs
-- accumulates completed segments. Elapsed = timer_accum_secs + (now - started) while
-- running, and freezes to timer_accum_secs on completion. This lets the timer keep
-- counting across page refresh/close and support pause/resume.
ALTER TABLE strength_sessions ADD COLUMN IF NOT EXISTS timer_started_at timestamptz;
ALTER TABLE strength_sessions ADD COLUMN IF NOT EXISTS timer_accum_secs integer NOT NULL DEFAULT 0;
