-- Dynamic Strength Builder — Phase 3: niggle / injury log. Active niggles drive
-- automatic, reversible session adjustments (exclude risky moves, reduce load, or
-- substitute a safer alternative) via the TS rules in strength-injuries.ts.
-- Resolve = flip `active` false (the row is kept for history). Nullable user_id
-- for the multi-tenancy milestone.

CREATE TABLE IF NOT EXISTS strength_niggles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid,
  body_area       text NOT NULL,                 -- knee|achilles|calf|hamstring|hip|lower_back|shoulder|ankle|foot
  severity        text NOT NULL DEFAULT 'mild',  -- mild|moderate|severe
  effect_override text,                          -- optional: force exclude|load_reduction|substitute
  note            text,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);

ALTER TABLE strength_niggles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON strength_niggles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS strength_niggles_active_idx ON strength_niggles(active);
