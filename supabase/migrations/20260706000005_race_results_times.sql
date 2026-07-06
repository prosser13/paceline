-- Richer manual race results: an official-results link, chip + gun finish times
-- (with which is primary for the athlete), and chip/gun for the other finishers.

ALTER TABLE race_results
  ADD COLUMN IF NOT EXISTS results_url         text,
  ADD COLUMN IF NOT EXISTS finish_time_gun     text,   -- finish_time stays = chip
  ADD COLUMN IF NOT EXISTS time_type           text NOT NULL DEFAULT 'chip',  -- your primary time: chip|gun
  ADD COLUMN IF NOT EXISTS neighbour_time_type text NOT NULL DEFAULT 'gun';    -- others' times: chip|gun
