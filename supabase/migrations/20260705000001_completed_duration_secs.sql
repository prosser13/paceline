-- Precise moving time (seconds) per completed workout. `actual_duration_mins` is
-- numeric(6,1) so it can only hold whole/tenth minutes — a 34:02 race stored as
-- 34.0, which made the plan display round to 34:00. This column preserves the
-- exact Strava moving time so the actual race/run time reads to the second.
-- Nullable: reads fall back to `actual_duration_mins` when null (rows synced
-- before this column / non-Strava completions).
alter table completed_workouts
  add column if not exists actual_duration_secs integer;

comment on column completed_workouts.actual_duration_secs is
  'Moving time in seconds (Strava moving_time). Preferred over actual_duration_mins for display precision; null = fall back to the minute-rounded value.';

-- One-time backfill from the matched activity's stored moving time.
update completed_workouts cw
set actual_duration_secs = a.moving_time_secs
from activities a
where a.strava_activity_id = cw.strava_activity_id
  and cw.actual_duration_secs is null
  and a.moving_time_secs is not null;
