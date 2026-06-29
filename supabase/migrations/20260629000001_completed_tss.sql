-- Stored Training Stress Score per completed workout. TSS depends on the user's
-- threshold pace / FTP (both editable), so it is recomputed for ALL rows whenever
-- those change (see recomputeAllCompletedTss) rather than frozen at sync time.
-- Nullable: reads fall back to live computation when null.
alter table completed_workouts
  add column if not exists tss numeric;

comment on column completed_workouts.tss is
  'Training Stress Score. Runs: rTSS = hours x (threshold_pace / coalesce(NGP, avg_pace))^2 x 100. Rides: hours x (avg_power / FTP)^2 x 100, FTP = top of the Z4 power zone. Recomputed for every row when threshold pace or power zones change (recomputeAllCompletedTss). Null = compute live from actuals + current threshold/FTP.';

-- One-time backfill from the current threshold pace + Z4 FTP. Ongoing freshness is
-- handled in the app; this just populates the existing rows.
with cfg as (
  select (split_part(threshold_pace_per_km, ':', 1)::numeric
          + split_part(threshold_pace_per_km, ':', 2)::numeric / 60) as thresh_min_km
  from app_config
  limit 1
),
ftp as (
  select power_max as watts from power_zones where zone_key = 'Z4' limit 1
)
update completed_workouts cw
set tss = case
  when cw.actual_duration_mins is not null
       and coalesce(cw.actual_ngp_min_km, cw.actual_avg_pace_min_km) > 0
    then round((cw.actual_duration_mins / 60.0)
         * power((select thresh_min_km from cfg) / coalesce(cw.actual_ngp_min_km, cw.actual_avg_pace_min_km), 2)
         * 100)
  when cw.actual_duration_mins is not null
       and cw.actual_avg_power is not null
       and (select watts from ftp) > 0
    then round((cw.actual_duration_mins / 60.0)
         * power(cw.actual_avg_power / (select watts from ftp), 2)
         * 100)
  else null
end;
