-- Link a planned race session to its curated race-guide page (/races/<slug>),
-- so the plan can show a "Race Guide" link on race rows.
ALTER TABLE plan_sessions ADD COLUMN IF NOT EXISTS race_slug text;
