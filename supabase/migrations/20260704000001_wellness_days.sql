-- Per-day wellness/biometric history from intervals.icu (Garmin-sourced).
--
-- Distinct from `intervals_wellness_cache`: that is a single-row snapshot cache
-- for the dashboard form meter (CTL/ATL/TSB only). This is the persistent daily
-- store of the full biometric set — sleep, HRV, resting HR, steps, VO2max — one
-- row per calendar date, upserted by the scheduled wellness sync (every 4h). We
-- keep the whole intervals record in `raw` so no field is ever lost before we
-- model it, and `intervals_updated` records the source row's freshness.
--
-- Global (single-athlete) for now; `date` is the natural key. Under multi-tenancy
-- this gains a `user_id` and the PK becomes (user_id, date) — same seam as the
-- other integration tables.

CREATE TABLE IF NOT EXISTS wellness_days (
  date               date PRIMARY KEY,
  ctl                numeric(6,2),   -- Fitness (chronic training load)
  atl                numeric(6,2),   -- Fatigue (acute training load)
  resting_hr         smallint,       -- bpm
  hrv                numeric(6,1),   -- overnight HRV (ms, rMSSD)
  sleep_secs         integer,        -- total sleep (seconds)
  sleep_score        numeric(5,1),   -- 0–100
  sleep_quality      smallint,       -- intervals sleep-quality code
  steps              integer,
  vo2max             numeric(4,1),
  weight             numeric(5,1),   -- kg (null until logged)
  cycling_eftp_w     integer,        -- estimated FTP from ride power (watts)
  intervals_updated  timestamptz,    -- the source record's `updated` timestamp
  raw                jsonb,          -- full intervals wellness record (future-proof)
  synced_at          timestamptz NOT NULL DEFAULT now()
);

-- Fast "recent days" / "latest" reads.
CREATE INDEX IF NOT EXISTS wellness_days_date_desc ON wellness_days (date DESC);

ALTER TABLE wellness_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON wellness_days FOR ALL TO authenticated USING (true) WITH CHECK (true);
