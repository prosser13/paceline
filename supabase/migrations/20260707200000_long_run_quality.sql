-- Long-run quality metrics (PB-campaign wave 3), computed from Strava streams at
-- sync time and stored on the completion (like actual_ngp_min_km):
--   decoupling_pct  — aerobic decoupling / cardiac drift: how much the
--                     grade-adjusted-speed:HR efficiency drops from the first half
--                     to the second. Lower is better (<5% = strong aerobic base).
--   pace_decay_pct  — grade-adjusted pace slowdown of the final third vs the first
--                     two-thirds. Lower is better (held pace to the end).
-- Positive = worse (drifted / slowed); negative = negative-split / got more efficient.
alter table public.completed_workouts
  add column if not exists decoupling_pct numeric,
  add column if not exists pace_decay_pct numeric;
