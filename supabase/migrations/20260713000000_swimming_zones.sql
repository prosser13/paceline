-- Swimming support: a third activity type alongside running + cycling.
-- Running is pace+distance, cycling is power+duration, swimming is distance +
-- pace-per-100m with its own zone table (seconds/100m). Swim HR is unreliable in
-- the water, so there is no swim HR zone table. Multi-tenant: per-user rows,
-- own_rows RLS, PK (user_id, zone_key) — mirrors the current power_zones shape.
--
-- NOTE: applied to the live project via the Supabase MCP apply_migration; this
-- file is the documentation copy (the live DB is the source of truth).

-- Swim pace zones (seconds per 100 m) — mirrors power_zones.
CREATE TABLE IF NOT EXISTS swim_pace_zones (
  user_id      uuid NOT NULL,
  zone_key     text NOT NULL,   -- 'Z1'..'Zn'
  name         text NOT NULL,
  pace_min_sec integer NOT NULL, -- sec/100m, fast end (smaller)
  pace_max_sec integer NOT NULL, -- sec/100m, slow end (larger)
  sort_order   integer NOT NULL,
  PRIMARY KEY (user_id, zone_key)
);
ALTER TABLE swim_pace_zones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_rows ON swim_pace_zones;
CREATE POLICY own_rows ON swim_pace_zones FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Single-row-per-user swim config: CSS threshold (sec/100m) + pool size (metres).
CREATE TABLE IF NOT EXISTS swim_config (
  user_id        uuid PRIMARY KEY,
  css_sec_per_100 integer,          -- Critical Swim Speed, sec/100m
  pool_size_m    integer NOT NULL DEFAULT 25
);
ALTER TABLE swim_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_rows ON swim_config;
CREATE POLICY own_rows ON swim_config FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Seed the primary user (mirrors how power_zones is seeded for one user).
-- Placeholder zones around a CSS of 1:45/100m — the user tunes these in Settings.
INSERT INTO swim_pace_zones (user_id, zone_key, name, pace_min_sec, pace_max_sec, sort_order) VALUES
  ('647785aa-a0e3-4640-87a6-c68017197689', 'Z1', 'Recovery',          120, 140, 1),
  ('647785aa-a0e3-4640-87a6-c68017197689', 'Z2', 'Aerobic Endurance', 112, 119, 2),
  ('647785aa-a0e3-4640-87a6-c68017197689', 'Z3', 'Tempo',             106, 111, 3),
  ('647785aa-a0e3-4640-87a6-c68017197689', 'Z4', 'Threshold',         100, 105, 4),
  ('647785aa-a0e3-4640-87a6-c68017197689', 'Z5', 'VO2 / Sprint',       80,  99, 5)
ON CONFLICT (user_id, zone_key) DO NOTHING;

INSERT INTO swim_config (user_id, css_sec_per_100, pool_size_m)
VALUES ('647785aa-a0e3-4640-87a6-c68017197689', 105, 25)
ON CONFLICT (user_id) DO NOTHING;
