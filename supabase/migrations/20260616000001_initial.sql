-- Plan sessions (Pfitz 12/70, single-user)
CREATE TABLE plan_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_number integer NOT NULL CHECK (week_number BETWEEN 1 AND 20),
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 1 AND 7), -- 1=Mon, 7=Sun
  session_type text NOT NULL,
  name text NOT NULL,
  description text,
  distance_km numeric(6,2),
  warmup_km numeric(6,2),
  cooldown_km numeric(6,2),
  workout_steps jsonb,
  notes text,
  scheduled_date date,
  is_completed boolean DEFAULT false,
  intervals_event_id text UNIQUE,
  intervals_synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX plan_sessions_week_day ON plan_sessions (week_number, day_of_week);
CREATE INDEX plan_sessions_date ON plan_sessions (scheduled_date);

-- Completed workouts
CREATE TABLE completed_workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_session_id uuid REFERENCES plan_sessions(id) ON DELETE SET NULL,
  completed_date date NOT NULL,
  actual_distance_km numeric(6,2),
  actual_duration_mins numeric(6,1),
  actual_avg_hr integer,
  actual_avg_pace_min_km numeric(5,2),
  perceived_effort integer CHECK (perceived_effort BETWEEN 1 AND 10),
  notes text,
  source text DEFAULT 'manual', -- manual | strava | garmin
  strava_activity_id bigint,
  created_at timestamptz DEFAULT now()
);

-- App-wide config (single-row settings)
CREATE TABLE app_config (
  key text PRIMARY KEY,
  value text NOT NULL
);

INSERT INTO app_config (key, value) VALUES
  ('plan_start_date',      '2026-08-17'),
  ('marathon_date',        '2026-11-08'),
  ('plan_name',            'Pfitz 12/70'),
  ('intervals_athlete_id', 'i330821');

-- RLS: authenticated users only (single user for now)
ALTER TABLE plan_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE completed_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config         ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all"  ON plan_sessions      FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all"  ON completed_workouts FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "read_auth" ON app_config         FOR SELECT TO authenticated USING (true);

-- Auto-update updated_at on plan_sessions
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER plan_sessions_updated_at
  BEFORE UPDATE ON plan_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
