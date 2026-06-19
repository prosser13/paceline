-- Multi-plan model: plans own a calendar span; weeks/sessions carry a plan_id.
-- Plan status is derived from dates (future / active / archived).
ALTER TABLE plans ALTER COLUMN race_date DROP NOT NULL;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS kind       text NOT NULL DEFAULT 'race';  -- 'race' | 'recovery'
ALTER TABLE plans ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS end_date   date;
ALTER TABLE plan_weeks    ADD COLUMN IF NOT EXISTS plan_id integer;
ALTER TABLE plan_sessions ADD COLUMN IF NOT EXISTS plan_id integer;

DO $$ BEGIN
  ALTER TABLE plans ADD CONSTRAINT plans_slug_unique UNIQUE (slug);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO plans (name, slug, kind, race_date, distance_km, target_time, target_pace, start_date, end_date, sort_order)
VALUES ('Dragon 50 Ultra','dragon-50','race','2026-07-19',80,'7:30','5:30','2026-06-01','2026-07-19',1)
ON CONFLICT (slug) DO UPDATE SET
  kind=EXCLUDED.kind, race_date=EXCLUDED.race_date, distance_km=EXCLUDED.distance_km,
  target_time=EXCLUDED.target_time, target_pace=EXCLUDED.target_pace,
  start_date=EXCLUDED.start_date, end_date=EXCLUDED.end_date, sort_order=EXCLUDED.sort_order;

INSERT INTO plans (name, slug, kind, start_date, end_date, sort_order)
VALUES ('Recovery','recovery','recovery','2026-07-20','2026-08-16',2)
ON CONFLICT (slug) DO UPDATE SET
  kind=EXCLUDED.kind, start_date=EXCLUDED.start_date, end_date=EXCLUDED.end_date, sort_order=EXCLUDED.sort_order;

UPDATE plans SET kind='race', start_date='2026-08-17', end_date='2026-11-08', sort_order=3 WHERE slug='malaga-marathon';

UPDATE plan_weeks    SET plan_id = (SELECT id FROM plans WHERE slug='dragon-50') WHERE plan_id IS NULL;
UPDATE plan_sessions SET plan_id = (SELECT id FROM plans WHERE slug='dragon-50') WHERE plan_id IS NULL;
