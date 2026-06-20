-- Strength session history (single-user for now). Exercises live in a hardcoded
-- TS library, referenced here by id + name (name stored so old sessions survive
-- library changes). No progression / config tables — manual edits during a
-- session are saved on the session record only.

CREATE TABLE IF NOT EXISTS strength_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  short_id     varchar(12) UNIQUE NOT NULL,
  intent       text NOT NULL,
  duration     text NOT NULL,
  groups       text[] NOT NULL DEFAULT '{}',
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE strength_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON strength_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS strength_session_exercises (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id           uuid NOT NULL REFERENCES strength_sessions(id) ON DELETE CASCADE,
  position             integer NOT NULL DEFAULT 0,
  exercise_id          integer NOT NULL,
  exercise_name        text NOT NULL,
  reps_type            text NOT NULL DEFAULT 'reps',
  sets                 integer NOT NULL DEFAULT 3,
  reps_value           integer,
  weight_kg            numeric,
  difficulty           integer,
  is_done              boolean NOT NULL DEFAULT false,
  completed_in_seconds integer
);
ALTER TABLE strength_session_exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON strength_session_exercises FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS strength_session_exercises_session_idx ON strength_session_exercises(session_id);
