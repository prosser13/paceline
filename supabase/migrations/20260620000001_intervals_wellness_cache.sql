-- Single-row cache for intervals.icu wellness (fitness / fatigue / form + history).
-- The dashboard reads from here and only calls the intervals.icu API when the
-- cached row is from an earlier day (first visit of the day) or has been flagged
-- stale by the Strava sync (a new run was detected). This removes the external
-- API round-trip from nearly every page load.

CREATE TABLE IF NOT EXISTS intervals_wellness_cache (
  id           smallint PRIMARY KEY DEFAULT 1,
  fetched_date date,                    -- the (UTC) date the cached data was fetched for
  form         integer,                 -- TSB (CTL − ATL)
  fitness      integer,                 -- CTL
  fatigue      integer,                 -- ATL
  history      jsonb,                   -- FitnessPoint[] for the trend chart
  stale        boolean NOT NULL DEFAULT false,  -- set true by Strava sync to force a refetch
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intervals_wellness_cache_single_row CHECK (id = 1)
);

ALTER TABLE intervals_wellness_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON intervals_wellness_cache FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO intervals_wellness_cache (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
