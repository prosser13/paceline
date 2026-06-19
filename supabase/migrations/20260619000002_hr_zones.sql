-- Heart-rate zones + threshold/max/resting config (mirrors pace zones).
CREATE TABLE IF NOT EXISTS hr_zones (
  zone_key   text PRIMARY KEY,   -- 'Z1'..'Zn'
  name       text NOT NULL,
  hr_min     integer NOT NULL,   -- bpm
  hr_max     integer NOT NULL,   -- bpm
  sort_order integer NOT NULL
);
ALTER TABLE hr_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON hr_zones FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO hr_zones (zone_key, name, hr_min, hr_max, sort_order) VALUES
  ('Z1', 'Recovery',          111, 140, 1),
  ('Z2', 'Aerobic Endurance', 141, 152, 2),
  ('Z3', 'Tempo',             153, 161, 3),
  ('Z4', 'Threshold',         162, 170, 4),
  ('Z5', 'Anaerobic',         171, 187, 5)
ON CONFLICT (zone_key) DO NOTHING;

-- Single-row config for HR threshold values
CREATE TABLE IF NOT EXISTS hr_config (
  id           integer PRIMARY KEY DEFAULT 1,
  threshold_hr integer,
  max_hr       integer,
  resting_hr   integer,
  CONSTRAINT hr_config_singleton CHECK (id = 1)
);
ALTER TABLE hr_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON hr_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO hr_config (id, threshold_hr, max_hr, resting_hr) VALUES (1, 171, 188, 43)
ON CONFLICT (id) DO NOTHING;
