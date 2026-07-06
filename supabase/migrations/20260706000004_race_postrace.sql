-- Post-race data for the race page: weather snapshot, coach debrief, manual full
-- results, and the athlete's own race notes. All keyed by race guide slug.

CREATE TABLE IF NOT EXISTS race_weather (
  slug         text PRIMARY KEY,
  race_date    date,
  forecast     jsonb NOT NULL,          -- RaceForecast (hours[], high, low, wind, summary…)
  source       text NOT NULL,           -- 'forecast' | 'archive'
  captured_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS race_analyses (
  slug        text PRIMARY KEY,
  headline    text NOT NULL,
  body_md     text NOT NULL,
  model       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS race_results (
  slug          text PRIMARY KEY,
  finish_time   text,
  position      integer,
  field_size    integer,
  category      text,
  category_pos  integer,
  category_size integer,
  winner_time   text,
  neighbours    jsonb NOT NULL DEFAULT '[]',   -- [{position,name,time}] 2 ahead + 2 behind
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS race_notes (
  slug        text PRIMARY KEY,
  race_date   date,
  body        text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE race_weather  ENABLE ROW LEVEL SECURITY;
ALTER TABLE race_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE race_results  ENABLE ROW LEVEL SECURITY;
ALTER TABLE race_notes    ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON race_weather  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON race_analyses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON race_results  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON race_notes    FOR ALL TO authenticated USING (true) WITH CHECK (true);
