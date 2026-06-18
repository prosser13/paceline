-- Pace zones — the canonical zone → pace-window definitions.
-- Planned-session segments are mapped to a zone at render time; the pace and
-- approximate time shown are derived from these windows, so editing a zone in
-- Settings updates every session's paces.

CREATE TABLE IF NOT EXISTS pace_zones (
  zone_key   text PRIMARY KEY,   -- 'Z1'..'Z5'
  name       text NOT NULL,      -- 'Recovery', 'Tempo', ...
  pace_min   text NOT NULL,      -- faster bound, "m:ss" min/km
  pace_max   text NOT NULL,      -- slower bound, "m:ss" min/km
  sort_order integer NOT NULL
);

ALTER TABLE pace_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON pace_zones FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO pace_zones (zone_key, name, pace_min, pace_max, sort_order) VALUES
  ('Z1', 'Recovery',          '5:00', '6:00', 1),
  ('Z2', 'Aerobic Endurance', '4:15', '4:59', 2),
  ('Z3', 'Tempo',             '3:45', '4:14', 3),
  ('Z4', 'Threshold',         '3:32', '3:44', 4),
  ('Z5', 'Anaerobic',         '2:50', '3:31', 5)
ON CONFLICT (zone_key) DO NOTHING;
