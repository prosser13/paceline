-- The coach's "has availability changed since I last looked?" gate. A singleton
-- marker: `content_updated_at` is bumped on ANY change to the availability table
-- (via a statement-level trigger, so manual SQL edits count too), and
-- `last_reviewed_at` records when the coach last reviewed. The briefing derives
-- `changed_since_review` from the two so the coach only re-leads with availability
-- when something actually moved. Applied live via the Supabase MCP; committed copy.

CREATE TABLE IF NOT EXISTS availability_review (
  id                 smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  content_updated_at timestamptz NOT NULL DEFAULT now(),  -- bumped on any availability change
  last_reviewed_at   timestamptz                          -- when the coach last reviewed
);
INSERT INTO availability_review (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- RLS enabled, no policy → service-role only (matches every other table).
ALTER TABLE availability_review ENABLE ROW LEVEL SECURITY;

-- Statement-level trigger: any insert/update/delete on `availability` bumps the
-- marker, so even manual SQL edits (not just the app's replace-on-save path) count.
CREATE OR REPLACE FUNCTION bump_availability_updated() RETURNS trigger AS $$
BEGIN
  INSERT INTO availability_review (id, content_updated_at) VALUES (1, now())
  ON CONFLICT (id) DO UPDATE SET content_updated_at = now();
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS availability_bump ON availability;
CREATE TRIGGER availability_bump
  AFTER INSERT OR UPDATE OR DELETE ON availability
  FOR EACH STATEMENT EXECUTE FUNCTION bump_availability_updated();
