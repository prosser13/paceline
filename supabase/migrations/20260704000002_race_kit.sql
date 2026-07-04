-- Per-race kit overrides. The curated kit lists live in code (src/data/races/*),
-- but the athlete can edit their own kit on the race page — add/rename/delete rows
-- across Wear / Carry / Drop bag / Night-before. When a row exists here for a race
-- slug, it fully replaces the guide's kit for that race.
--
-- Single-tenant today (keyed by race slug); gains a user_id under multi-tenancy.

CREATE TABLE IF NOT EXISTS race_kit (
  slug         text PRIMARY KEY,            -- matches the race guide / plans slug
  wear         jsonb NOT NULL DEFAULT '[]', -- KitItem[]  { label, detail? }
  carry        jsonb NOT NULL DEFAULT '[]', -- KitItem[]
  drop_bag     jsonb NOT NULL DEFAULT '[]', -- KitItem[]
  night_before jsonb NOT NULL DEFAULT '[]', -- string[]
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE race_kit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON race_kit FOR ALL TO authenticated USING (true) WITH CHECK (true);
