-- Multi-tenant migration: backfill every existing row to the sole owner
-- (prosser13@gmail.com — the only user before this milestone). All pre-existing data
-- is single-user history. Idempotent: only fills rows still NULL.
do $$
declare
  t text;
  owner uuid := '647785aa-a0e3-4640-87a6-c68017197689';
  tables text[] := array[
    'plans','plan_weeks','plan_sessions','completed_workouts','activities',
    'session_matches','adjustment_logs','pace_zones','hr_zones','hr_config',
    'power_zones','power_config','bike_hr_zones','bike_hr_config','weather_config',
    'coaching_prefs','plan_constraints','strength_tuning','coach_context',
    'wellness_days','intervals_wellness_cache','benchmark_snapshots','threshold_checks',
    'coach_messages','daily_notes','sync_alerts','banner_dismissals','fuel_products',
    'availability','availability_review','race_results','race_notes','race_kit',
    'race_weather','race_analyses','strength_sessions','strength_session_exercises',
    'app_config','strava_connection','strength_exercise_state','strength_niggles',
    'strength_progression_events'
  ];
begin
  foreach t in array tables loop
    execute format('update public.%I set user_id = %L where user_id is null', t, owner);
  end loop;

  -- Seed the owner's integration row with the known intervals.icu athlete id (the old
  -- hardcoded constant). The API key + Telegram chat id are secrets not stored here —
  -- the owner enters them via Settings → Integrations (the old env vars are no longer
  -- read). Workout sync defaults on (the owner used the Garmin push).
  insert into public.user_integrations (user_id, intervals_athlete_id, intervals_workout_sync)
  values (owner, 'i330821', true)
  on conflict (user_id) do nothing;
end $$;
