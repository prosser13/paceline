-- Cross-device banner dismissals: one row per banner "family" holding the content
-- signature that was dismissed. A banner reappears once its signature changes (new
-- content). Service-role only (RLS on, no policy) like the rest of the schema.
CREATE TABLE IF NOT EXISTS banner_dismissals (
  family       text PRIMARY KEY,
  signature    text NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE banner_dismissals ENABLE ROW LEVEL SECURITY;
