-- July 2026 codebase-review follow-up: hot-column indexes, referential-integrity
-- FKs, a widened week_number cap, and dropping the unused permissive RLS policies.
-- All idempotent. Applied to the live project via the Supabase MCP; this file is
-- the committed copy.

-- 1) Hot-column indexes ───────────────────────────────────────────────────────
-- Every dashboard/plan load filters completed_workouts by completed_date and
-- activities by activity_date, and matching/cascade paths hit these ids — none had
-- a secondary index. Additive; no behaviour change.
CREATE INDEX IF NOT EXISTS completed_workouts_completed_date_idx     ON completed_workouts (completed_date);
CREATE INDEX IF NOT EXISTS completed_workouts_strava_activity_id_idx ON completed_workouts (strava_activity_id);
CREATE INDEX IF NOT EXISTS activities_activity_date_idx              ON activities (activity_date);
CREATE INDEX IF NOT EXISTS session_matches_activity_id_idx           ON session_matches (activity_id);

-- 2) Referential integrity for plan children ──────────────────────────────────
-- plan_weeks/plan_sessions belonged to plans, and strength_sessions to a planned
-- session, only by convention (no FK). Verified orphan-free before adding. CASCADE
-- for the plan children (a plan owns them); SET NULL for the strength link (matches
-- completed_workouts.plan_session_id, and lets the gen-* scripts keep deleting a
-- plan's sessions).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_weeks_plan_id_fkey') THEN
    ALTER TABLE plan_weeks ADD CONSTRAINT plan_weeks_plan_id_fkey
      FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_sessions_plan_id_fkey') THEN
    ALTER TABLE plan_sessions ADD CONSTRAINT plan_sessions_plan_id_fkey
      FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'strength_sessions_plan_session_id_fkey') THEN
    ALTER TABLE strength_sessions ADD CONSTRAINT strength_sessions_plan_session_id_fkey
      FOREIGN KEY (plan_session_id) REFERENCES plan_sessions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3) Widen the week_number cap ────────────────────────────────────────────────
-- Was 1..20, which would reject a 24-week Pfitz block or a full-year plan with an
-- opaque constraint error. No existing row is affected.
ALTER TABLE plan_sessions DROP CONSTRAINT IF EXISTS plan_sessions_week_number_check;
ALTER TABLE plan_sessions ADD  CONSTRAINT plan_sessions_week_number_check CHECK (week_number >= 1 AND week_number <= 52);

-- 4) Drop the unused permissive RLS policies ──────────────────────────────────
-- The app reads/writes every table through the service-role client (bypasses RLS);
-- these `authenticated USING(true)` policies grant no legitimate access and only
-- widen the anon-key attack surface. RLS stays ENABLED, so the tables become
-- service-role-only — the same posture as the newer tables (coach_messages, etc.).
DROP POLICY IF EXISTS auth_all  ON activities;
DROP POLICY IF EXISTS auth_all  ON adjustment_logs;
DROP POLICY IF EXISTS read_auth ON app_config;
DROP POLICY IF EXISTS auth_all  ON bike_hr_config;
DROP POLICY IF EXISTS auth_all  ON bike_hr_zones;
DROP POLICY IF EXISTS auth_all  ON coaching_prefs;
DROP POLICY IF EXISTS auth_all  ON completed_workouts;
DROP POLICY IF EXISTS auth_all  ON hr_config;
DROP POLICY IF EXISTS auth_all  ON hr_zones;
DROP POLICY IF EXISTS auth_all  ON intervals_wellness_cache;
DROP POLICY IF EXISTS auth_all  ON pace_zones;
DROP POLICY IF EXISTS auth_all  ON plan_constraints;
DROP POLICY IF EXISTS auth_all  ON plan_sessions;
DROP POLICY IF EXISTS auth_all  ON plan_weeks;
DROP POLICY IF EXISTS auth_all  ON plans;
DROP POLICY IF EXISTS auth_all  ON power_config;
DROP POLICY IF EXISTS auth_all  ON power_zones;
DROP POLICY IF EXISTS auth_all  ON race_analyses;
DROP POLICY IF EXISTS auth_all  ON race_kit;
DROP POLICY IF EXISTS auth_all  ON race_notes;
DROP POLICY IF EXISTS auth_all  ON race_results;
DROP POLICY IF EXISTS auth_all  ON race_weather;
DROP POLICY IF EXISTS auth_all  ON session_matches;
DROP POLICY IF EXISTS auth_all  ON strength_exercise_state;
DROP POLICY IF EXISTS auth_all  ON strength_niggles;
DROP POLICY IF EXISTS auth_all  ON strength_progression_events;
DROP POLICY IF EXISTS auth_all  ON strength_session_exercises;
DROP POLICY IF EXISTS auth_all  ON strength_sessions;
DROP POLICY IF EXISTS auth_all  ON strength_tuning;
DROP POLICY IF EXISTS auth_all  ON wellness_days;
