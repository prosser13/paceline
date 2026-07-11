-- The coach's "has availability changed since I last looked?" gate, PER USER.
-- `content_updated_at` is bumped on any change to that user's availability rows
-- (via a row-level trigger, so manual SQL edits count too), and `last_reviewed_at`
-- records when the coach last reviewed for that user. The briefing derives
-- `changed_since_review` from the two so the coach only re-leads with availability
-- when something actually moved. Applied live via the Supabase MCP; committed copy.
--
-- NOTE: this reflects the multi-tenant shape (one row per user). The original
-- version was an id=1 singleton; the multi-tenant migrations re-keyed it to
-- user_id, so both the table and the trigger below are per-user.

CREATE TABLE IF NOT EXISTS availability_review (
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_updated_at timestamptz NOT NULL DEFAULT now(),  -- bumped on any availability change
  last_reviewed_at   timestamptz                          -- when the coach last reviewed
);
CREATE UNIQUE INDEX IF NOT EXISTS availability_review_user_uniq ON availability_review (user_id);

-- RLS enabled, no policy → service-role only (matches every other table).
ALTER TABLE availability_review ENABLE ROW LEVEL SECURITY;

-- Row-level trigger: any insert/update/delete on `availability` bumps the AFFECTED
-- user's marker, so even manual SQL edits (not just the app's replace-on-save path)
-- count.
CREATE OR REPLACE FUNCTION bump_availability_updated() RETURNS trigger AS $$
DECLARE uid uuid;
BEGIN
  uid := COALESCE(NEW.user_id, OLD.user_id);
  INSERT INTO availability_review (user_id, content_updated_at) VALUES (uid, now())
  ON CONFLICT (user_id) DO UPDATE SET content_updated_at = now();
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS availability_bump ON availability;
CREATE TRIGGER availability_bump
  AFTER INSERT OR UPDATE OR DELETE ON availability
  FOR EACH ROW EXECUTE FUNCTION bump_availability_updated();
