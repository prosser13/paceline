-- Total elevation gain (metres) from the matched Strava activity summary, captured
-- at sync. The coach uses it as the terrain/hilliness signal alongside NGP.
-- (Documentation copy — applied to the live DB via the Supabase MCP.)
alter table completed_workouts
  add column if not exists actual_elevation_gain_m numeric;

comment on column completed_workouts.actual_elevation_gain_m is
  'Total elevation gain (metres) from the matched Strava activity summary (total_elevation_gain). Captured at sync; the coach uses it as the terrain/hilliness signal alongside NGP.';
