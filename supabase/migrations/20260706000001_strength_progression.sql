-- Dynamic Strength Builder — Phase 1: progression state + audit + tuning.
--
-- Turns the static builder into one that gets harder as the user completes
-- sessions. The 1–5 difficulty rating already captured on
-- strength_session_exercises now drives a double-progression engine.
--
--   • strength_exercise_state       — per-exercise, per-intent working reps/weight
--   • strength_progression_events   — audit log of every automatic change (mirrors adjustment_logs)
--   • strength_tuning               — single-row, data-backed knobs the coach can later adjust
--   • coaching_prefs.strength_progression_mode — hybrid | progressive | maintenance
--
-- Global single-user today; nullable user_id keeps the shape ready for the
-- multi-tenancy milestone (scoping lands in the data layer, not here).

-- ── per-exercise progression state ──────────────────────────────
-- Absent row ⇒ fall back to the static library default, so unbuilt plans and
-- fresh installs behave exactly as before. NULLS NOT DISTINCT so the single-user
-- (user_id IS NULL) rows still upsert on the natural key.
CREATE TABLE IF NOT EXISTS strength_exercise_state (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid,                        -- nullable today; multi-tenant later
  exercise_id        integer NOT NULL,            -- FK-by-convention to the TS library
  intent             text NOT NULL,               -- 'strength' | 'maintain'
  current_reps       integer,                     -- working reps/secs within the band
  current_weight_kg  numeric,                     -- working load (null = bodyweight)
  consecutive_easy   integer NOT NULL DEFAULT 0,  -- streak of difficulty-1 ratings (weight-up hysteresis)
  last_prescribed_at timestamptz,
  last_completed_at  timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT strength_exercise_state_uniq UNIQUE NULLS NOT DISTINCT (user_id, exercise_id, intent)
);

-- ── progression audit log ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS strength_progression_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid,
  exercise_id   integer NOT NULL,
  intent        text NOT NULL,
  session_id    uuid REFERENCES strength_sessions(id) ON DELETE SET NULL,
  kind          text NOT NULL,          -- reps_up | weight_up | reps_down | weight_down | reset | manual
  reason        text,                   -- e.g. 'difficulty 1 at band top'
  before_state  jsonb,                  -- { reps, weightKg }
  after_state   jsonb,
  logged_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS strength_progression_events_session_idx ON strength_progression_events(session_id);
CREATE INDEX IF NOT EXISTS strength_progression_events_exercise_idx ON strength_progression_events(exercise_id, intent);

-- ── tunable knobs (single row, defaults are the engine's fallback) ──
CREATE TABLE IF NOT EXISTS strength_tuning (
  id                     smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  weight_up_streak       integer NOT NULL DEFAULT 1,   -- easy sessions at band top before a toning weight bump
  maintenance_streak     integer NOT NULL DEFAULT 3,   -- easy sessions at band top before a maintenance weight bump
  bodyweight_rep_ceiling integer NOT NULL DEFAULT 30,  -- cap on reps-only progression
  barbell_increment_kg   numeric NOT NULL DEFAULT 2.5,
  dumbbell_increment_kg  numeric NOT NULL DEFAULT 2.0,
  toning_reps_min        integer NOT NULL DEFAULT 8,   -- upper-body hypertrophy band floor
  toning_reps_max        integer NOT NULL DEFAULT 12,  -- upper-body hypertrophy band ceiling
  modifier_weights       jsonb,                        -- reserved for Phase 2 auto-regulation knobs
  updated_at             timestamptz NOT NULL DEFAULT now()
);
INSERT INTO strength_tuning (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── progression mode on the existing coaching prefs ─────────────
ALTER TABLE coaching_prefs
  ADD COLUMN IF NOT EXISTS strength_progression_mode text NOT NULL DEFAULT 'hybrid'; -- hybrid | progressive | maintenance

-- ── RLS (match the rest of the schema: authenticated full access) ──
ALTER TABLE strength_exercise_state     ENABLE ROW LEVEL SECURITY;
ALTER TABLE strength_progression_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE strength_tuning             ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON strength_exercise_state     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON strength_progression_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON strength_tuning             FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Keep updated_at fresh (reuses update_updated_at() from the initial migration).
CREATE TRIGGER strength_exercise_state_updated_at
  BEFORE UPDATE ON strength_exercise_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER strength_tuning_updated_at
  BEFORE UPDATE ON strength_tuning
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
