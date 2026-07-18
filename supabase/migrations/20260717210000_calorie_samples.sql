-- Predicted-vs-actual calorie samples, one row per to-plan run/ride completion.
-- Lets us re-derive MET calibration from data: query avg(actual/predicted) by
-- sport × intensity. workout_id (completed_workouts.id) is the natural key so a
-- re-sync upserts rather than duplicates. Idempotent.
CREATE TABLE IF NOT EXISTS calorie_samples (
  user_id         uuid        NOT NULL,
  workout_id      uuid        NOT NULL,
  completed_date  date        NOT NULL,
  sport           text        NOT NULL,
  intensity       text,
  source          text        NOT NULL,          -- 'power' | 'distance'
  predicted_kcal  integer     NOT NULL,
  actual_kcal     integer     NOT NULL,
  delta_pct       numeric(6,3) NOT NULL,          -- (actual - predicted) / predicted
  weight_kg       numeric(5,1),
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, workout_id)
);
CREATE INDEX IF NOT EXISTS calorie_samples_user_sport_idx ON calorie_samples (user_id, sport, intensity);
