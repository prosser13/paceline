-- Optional manual override of a planned run's intervals.icu workout text. When set,
-- the sync pushes this verbatim instead of the structure-derived text (and still
-- hashes it, so edits propagate). Used to hand-craft a step's on-watch text.
ALTER TABLE plan_sessions ADD COLUMN IF NOT EXISTS intervals_workout_override text;
