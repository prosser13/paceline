-- Phase 2 (coach causal reasoning): a per-activity split profile, computed at
-- Strava sync from the distance/time/HR/altitude streams and stored so the review
-- reads it rather than recomputing. Additive + idempotent.
alter table completed_workouts add column if not exists split_profile jsonb;

comment on column completed_workouts.split_profile is
  'Split profile computed at Strava sync from the distance/time/HR/altitude streams: per-quartile pace+GAP, first-20% vs target_pace, stopped time (elapsed-moving), split outliers, plus decoupling/pace-decay. Read by the coach review, not recomputed.';
