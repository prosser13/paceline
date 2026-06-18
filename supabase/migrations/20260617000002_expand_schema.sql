-- Expand plan_sessions with rich session fields
ALTER TABLE plan_sessions
  ADD COLUMN IF NOT EXISTS structure        jsonb,      -- [{phase, description}] steps
  ADD COLUMN IF NOT EXISTS target_pace      text,       -- e.g. "5:12"
  ADD COLUMN IF NOT EXISTS target_pace_end  text,       -- e.g. "5:30" (for ranges)
  ADD COLUMN IF NOT EXISTS estimated_tss    integer,
  ADD COLUMN IF NOT EXISTS estimated_duration text,     -- "h:mm"
  ADD COLUMN IF NOT EXISTS rationale        text,       -- the "why" paragraph
  ADD COLUMN IF NOT EXISTS status           text NOT NULL DEFAULT 'planned',
  ADD COLUMN IF NOT EXISTS intensity        text,       -- easy|steady|tempo|hard|race
  ADD COLUMN IF NOT EXISTS profile_shape    text,       -- easy|intervals|long|recovery
  ADD COLUMN IF NOT EXISTS week_phase       text,       -- Base|Build|Peak|Taper
  ADD COLUMN IF NOT EXISTS am_pm            text;       -- AM|PM for double days

-- Week-level metadata (phase, purpose, volume)
CREATE TABLE IF NOT EXISTS plan_weeks (
  week_number       integer PRIMARY KEY,
  phase             text NOT NULL,     -- Base|Build|Peak|Taper
  purpose           text,
  planned_volume_km numeric(6,1),
  date_from         date,
  date_to           date
);

-- Strava activity imports
CREATE TABLE IF NOT EXISTS activities (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strava_activity_id  bigint UNIQUE,
  activity_date       date NOT NULL,
  activity_type       text DEFAULT 'Run',
  name                text,
  distance_km         numeric(6,2),
  duration_mins       numeric(6,1),
  avg_pace_min_km     numeric(5,2),
  avg_hr              integer,
  actual_tss          integer,
  moving_time_secs    integer,
  raw_data            jsonb,
  created_at          timestamptz DEFAULT now()
);

-- Planned session ↔ Activity match (the planned-vs-actual spine)
CREATE TABLE IF NOT EXISTS session_matches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_session_id uuid REFERENCES plan_sessions(id) ON DELETE CASCADE,
  activity_id     uuid REFERENCES activities(id)    ON DELETE CASCADE,
  matched_at      timestamptz DEFAULT now(),
  match_source    text DEFAULT 'auto',  -- auto|manual
  UNIQUE (plan_session_id)
);

-- Adjust-today chip log (feeds v2 adaptive engine)
CREATE TABLE IF NOT EXISTS adjustment_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_session_id uuid REFERENCES plan_sessions(id) ON DELETE SET NULL,
  chip_used       text NOT NULL,  -- short_on_time|legs_feel_flat|cant_today
  before_state    jsonb,
  after_state     jsonb,
  logged_at       timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE plan_weeks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities      ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE adjustment_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON plan_weeks      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON activities      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON session_matches FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON adjustment_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
