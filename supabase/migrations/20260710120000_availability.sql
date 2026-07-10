-- Per-day training availability the user records in advance (the Availability
-- calendar section). The richer, per-date, structured sibling of plan_constraints:
-- one row per restriction, several allowed per day. Read as a set; edited a whole
-- day at a time (replace-on-save). Global single-set today (no user_id), shaped to
-- take one later under the multi-tenancy milestone. Applied live to the paceline
-- project via the Supabase MCP; this file is the committed idempotent copy.

CREATE TABLE IF NOT EXISTS availability (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date        date NOT NULL,
  -- 'full_day'          — whole day unavailable
  -- 'time_limited'      — only `minutes` available
  -- 'activity_limited'  — activities in `items` barred (e.g. 'cycling')
  -- 'equipment_limited' — equipment in `items` barred (e.g. 'Barbell')
  kind        text NOT NULL CHECK (kind IN ('full_day','time_limited','activity_limited','equipment_limited')),
  minutes     integer,                        -- time_limited: minutes available that day
  items       text[] NOT NULL DEFAULT '{}',   -- activity_limited / equipment_limited: the barred set
  note        text,                           -- optional free-text detail
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS availability_date_idx ON availability (date);

-- RLS enabled, no policy → service-role only (the current posture for every table;
-- see 20260709120000_review_indexes_fks_rls.sql). The app reads/writes via supabaseAdmin.
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;

-- Keep updated_at fresh (reuses the update_updated_at() trigger fn from the initial migration).
DROP TRIGGER IF EXISTS availability_updated_at ON availability;
CREATE TRIGGER availability_updated_at
  BEFORE UPDATE ON availability FOR EACH ROW EXECUTE FUNCTION update_updated_at();
