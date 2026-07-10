-- Add a 'reduced_intensity' availability kind: a day the user will be sub-optimal
-- (the day after a wedding or similar event) — not unavailable, just not up to hard
-- work. The coach should keep it easy on these days: no marathon-pace or hard
-- sessions, shifting any quality to the day before or after. Widens the kind CHECK.
-- Applied live to the paceline project via the Supabase MCP; committed idempotent copy.

ALTER TABLE availability DROP CONSTRAINT IF EXISTS availability_kind_check;
ALTER TABLE availability ADD CONSTRAINT availability_kind_check
  CHECK (kind IN ('full_day','reduced_intensity','time_limited','activity_limited','equipment_limited'));
