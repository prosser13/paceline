-- Cycling support: a second activity type alongside running.
--
-- Running is pace + distance; cycling is power + duration. Rather than overload
-- the pace tables, cycling gets its own zone tables (power + bike-specific HR,
-- which runs lower than running HR). Planned sessions carry an `activity_type`
-- so the dashboard/plan can render power+duration instead of pace+distance and
-- keep cycling out of running km/TSS totals.

-- ── Tag sessions by activity ─────────────────────────────────
ALTER TABLE plan_sessions
  ADD COLUMN IF NOT EXISTS activity_type text NOT NULL DEFAULT 'running'; -- 'running' | 'cycling'

-- ── Power zones (watts) — mirrors pace_zones ─────────────────
CREATE TABLE IF NOT EXISTS power_zones (
  zone_key   text PRIMARY KEY,   -- 'Z1'..'Zn'
  name       text NOT NULL,
  power_min  integer NOT NULL,   -- watts, lower bound
  power_max  integer NOT NULL,   -- watts, upper bound
  sort_order integer NOT NULL
);
ALTER TABLE power_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON power_zones FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO power_zones (zone_key, name, power_min, power_max, sort_order) VALUES
  ('Z1', 'Recovery',          0,   148,  1),
  ('Z2', 'Aerobic Endurance', 149, 202,  2),
  ('Z3', 'Tempo',             203, 243,  3),
  ('Z4', 'Threshold',         244, 284,  4),
  ('Z5', 'Anaerobic',         285, 2000, 5)
ON CONFLICT (zone_key) DO NOTHING;

-- Single-row config for the cycling power threshold (FTP).
CREATE TABLE IF NOT EXISTS power_config (
  id              integer PRIMARY KEY DEFAULT 1,
  threshold_power integer,            -- FTP, watts
  CONSTRAINT power_config_singleton CHECK (id = 1)
);
ALTER TABLE power_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON power_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO power_config (id, threshold_power) VALUES (1, 270)
ON CONFLICT (id) DO NOTHING;

-- ── Bike heart-rate zones — mirrors hr_zones, kept separate ──
CREATE TABLE IF NOT EXISTS bike_hr_zones (
  zone_key   text PRIMARY KEY,
  name       text NOT NULL,
  hr_min     integer NOT NULL,   -- bpm
  hr_max     integer NOT NULL,
  sort_order integer NOT NULL
);
ALTER TABLE bike_hr_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON bike_hr_zones FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO bike_hr_zones (zone_key, name, hr_min, hr_max, sort_order) VALUES
  ('Z1', 'Recovery',          94,  116, 1),
  ('Z2', 'Aerobic Endurance', 117, 142, 2),
  ('Z3', 'Tempo',             143, 161, 3),
  ('Z4', 'Threshold',         162, 180, 4),
  ('Z5', 'Anaerobic',         181, 255, 5)
ON CONFLICT (zone_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS bike_hr_config (
  id           integer PRIMARY KEY DEFAULT 1,
  threshold_hr integer,
  max_hr       integer,
  resting_hr   integer,
  CONSTRAINT bike_hr_config_singleton CHECK (id = 1)
);
ALTER TABLE bike_hr_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON bike_hr_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO bike_hr_config (id, threshold_hr, max_hr, resting_hr) VALUES (1, 171, 188, 43)
ON CONFLICT (id) DO NOTHING;

-- ── Ride actuals (forward-looking; not wired to Strava yet) ──
ALTER TABLE completed_workouts
  ADD COLUMN IF NOT EXISTS actual_avg_power integer,  -- watts
  ADD COLUMN IF NOT EXISTS segment_power    jsonb;    -- per-segment avg power

-- ── A separate cycling plan + its weeks + the planned rides ──
-- All Z2 aerobic endurance, time-based. Kept in its own plan so it doesn't
-- distort the Dragon 50 running stats; rendered by date on the dashboard.
INSERT INTO plans (name, slug, kind, start_date, end_date, sort_order)
VALUES ('Cycling', 'cycling', 'cycling', '2026-06-22', '2026-07-19', 4)
ON CONFLICT (slug) DO UPDATE SET
  kind = EXCLUDED.kind, start_date = EXCLUDED.start_date,
  end_date = EXCLUDED.end_date, sort_order = EXCLUDED.sort_order;

INSERT INTO plan_weeks (plan_id, week_number, phase, purpose, date_from, date_to)
SELECT p.id, w.week_number, 'Base', w.purpose, w.date_from::date, w.date_to::date
FROM plans p
CROSS JOIN (VALUES
  (1, 'Aerobic base', '2026-06-22', '2026-06-28'),
  (2, 'Aerobic base', '2026-06-29', '2026-07-05'),
  (3, 'Aerobic base', '2026-07-06', '2026-07-12'),
  (4, 'Aerobic base', '2026-07-13', '2026-07-19')
) AS w(week_number, purpose, date_from, date_to)
WHERE p.slug = 'cycling'
ON CONFLICT (plan_id, week_number) DO UPDATE SET
  phase = EXCLUDED.phase, purpose = EXCLUDED.purpose,
  date_from = EXCLUDED.date_from, date_to = EXCLUDED.date_to;

-- Idempotent seed of the eight rides.
DO $$
DECLARE cyc_id integer;
BEGIN
  SELECT id INTO cyc_id FROM plans WHERE slug = 'cycling';
  IF NOT EXISTS (SELECT 1 FROM plan_sessions WHERE plan_id = cyc_id AND activity_type = 'cycling') THEN
    INSERT INTO plan_sessions
      (plan_id, activity_type, week_number, day_of_week, session_type, name, description,
       scheduled_date, intensity, status, estimated_duration, estimated_tss, structure)
    VALUES
      (cyc_id, 'cycling', 1, 2, 'GA', 'Endurance Ride', 'Zone 2 aerobic ride', '2026-06-23', 'easy', 'planned', '1:00', 45,
        '[{"type":"phase","label":"Endurance","zone":"Z2","duration_mins":60}]'::jsonb),
      (cyc_id, 'cycling', 1, 4, 'GA', 'Endurance Ride', 'Zone 2 aerobic ride', '2026-06-25', 'easy', 'planned', '1:00', 45,
        '[{"type":"phase","label":"Endurance","zone":"Z2","duration_mins":60}]'::jsonb),
      (cyc_id, 'cycling', 2, 1, 'GA', 'Endurance Ride', 'Zone 2 aerobic ride', '2026-06-29', 'easy', 'planned', '1:00', 45,
        '[{"type":"phase","label":"Endurance","zone":"Z2","duration_mins":60}]'::jsonb),
      (cyc_id, 'cycling', 2, 4, 'GA', 'Endurance Ride', 'Zone 2 aerobic ride', '2026-07-02', 'easy', 'planned', '1:00', 45,
        '[{"type":"phase","label":"Endurance","zone":"Z2","duration_mins":60}]'::jsonb),
      (cyc_id, 'cycling', 3, 2, 'GA', 'Endurance Ride', 'Zone 2 aerobic ride', '2026-07-07', 'easy', 'planned', '1:00', 45,
        '[{"type":"phase","label":"Endurance","zone":"Z2","duration_mins":60}]'::jsonb),
      (cyc_id, 'cycling', 3, 4, 'GA', 'Endurance Ride', 'Zone 2 aerobic ride', '2026-07-09', 'easy', 'planned', '1:00', 45,
        '[{"type":"phase","label":"Endurance","zone":"Z2","duration_mins":60}]'::jsonb),
      (cyc_id, 'cycling', 3, 7, 'GA', 'Long Endurance Ride', 'Zone 2 aerobic ride', '2026-07-12', 'easy', 'planned', '2:00', 90,
        '[{"type":"phase","label":"Endurance","zone":"Z2","duration_mins":120}]'::jsonb),
      (cyc_id, 'cycling', 4, 2, 'GA', 'Endurance Ride', 'Zone 2 aerobic ride', '2026-07-14', 'easy', 'planned', '0:45', 34,
        '[{"type":"phase","label":"Endurance","zone":"Z2","duration_mins":45}]'::jsonb);
  END IF;
END $$;
