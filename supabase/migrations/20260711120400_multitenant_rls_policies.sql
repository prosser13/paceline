-- Multi-tenant RLS: each authenticated user may touch only their own rows. The app
-- reads via the service-role key (which bypasses RLS), so these are defense-in-depth
-- for any future anon-key path. Every listed table is RLS-enabled already (migration
-- 20260709120000 left them RLS-on / no-policy); this adds the owner policy. Idempotent.
do $$
declare
  t text;
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
    'strength_progression_events','user_integrations'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format(
      'create policy own_rows on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t);
  end loop;
end $$;
