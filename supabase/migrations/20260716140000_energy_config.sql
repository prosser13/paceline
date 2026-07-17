-- Daily calorie-target config, stored alongside the athlete's other per-user
-- nutrition settings in hydration_config. bmr_kcal is the manually-entered base
-- metabolic rate (kcal/day); activity_factor scales it for everyday non-exercise
-- activity (default applied in code = 1.3). Both nullable — the dashboard tile
-- falls back gracefully when unset. Idempotent.
ALTER TABLE hydration_config
  ADD COLUMN IF NOT EXISTS bmr_kcal integer,
  ADD COLUMN IF NOT EXISTS activity_factor numeric(3,2);
