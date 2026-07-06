-- Dynamic Strength Builder — Phase 2: link a live session to its plan context and
-- record the auto-regulation modifier applied when it was built. The modifier is
-- kept so the progression engine can tell a deliberately-light day (don't bump
-- load) from a genuine easy session, and so the UI can explain the adjustment.

ALTER TABLE strength_sessions
  ADD COLUMN IF NOT EXISTS plan_session_id uuid,   -- the planned session this came from (null = ad-hoc)
  ADD COLUMN IF NOT EXISTS modifier jsonb;         -- { loadScale, repsScale, setBias, groupBias, deliberatelyLight, reasons }
