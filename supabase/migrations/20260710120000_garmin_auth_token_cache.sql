-- Server-shared cache of the short-lived Garmin OAuth2 bearer, so serverless
-- invocations reuse one exchange for its ~1h life instead of re-exchanging each
-- time (Garmin rate-limits the exchange endpoint). Single-row table, service-role
-- only (RLS enabled, no policy).
CREATE TABLE IF NOT EXISTS garmin_auth (
  id integer PRIMARY KEY DEFAULT 1,
  access_token text,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT garmin_auth_singleton CHECK (id = 1)
);
ALTER TABLE garmin_auth ENABLE ROW LEVEL SECURITY;
