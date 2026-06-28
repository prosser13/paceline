-- Coaching inputs the plan agent reads each run: hard scheduling constraints and
-- the autonomy/guardrail preferences that bound what it may change unprompted.
-- Global single-row / single-set today (like hr_config / pace_zones); shaped to
-- take a user_id later under the multi-tenancy milestone.

-- Standing constraints on when the user can / can't train. Read as a set by the
-- agent; edited as a whole set in settings (replace-on-save).
CREATE TABLE IF NOT EXISTS plan_constraints (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL,            -- 'recurring' | 'blackout' | 'note'
  label       text NOT NULL,            -- human description, e.g. "No running — work late"
  day_of_week integer CHECK (day_of_week BETWEEN 1 AND 7),  -- recurring: 1=Mon..7=Sun
  date_from   date,                     -- blackout range start
  date_to     date,                     -- blackout range end
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- How much latitude the agent has, plus the guardrails it must respect. Single row.
CREATE TABLE IF NOT EXISTS coaching_prefs (
  id                  smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  autonomy            text    NOT NULL DEFAULT 'propose',  -- propose | auto_within_week | auto_full
  max_weekly_ramp_pct integer NOT NULL DEFAULT 10,         -- cap on week-on-week volume increase
  min_rest_days       integer NOT NULL DEFAULT 1,          -- keep at least this many rest days/week
  protect_priority_a  boolean NOT NULL DEFAULT true,       -- never move/alter A-priority sessions
  notes               text,                                -- free-text standing guidance for the coach
  updated_at          timestamptz NOT NULL DEFAULT now()
);

INSERT INTO coaching_prefs (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE plan_constraints ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_prefs   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON plan_constraints FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON coaching_prefs   FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Keep updated_at fresh (reuses the update_updated_at() trigger fn from the initial migration).
CREATE TRIGGER plan_constraints_updated_at
  BEFORE UPDATE ON plan_constraints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER coaching_prefs_updated_at
  BEFORE UPDATE ON coaching_prefs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
