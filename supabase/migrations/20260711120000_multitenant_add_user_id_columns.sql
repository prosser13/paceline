-- Multi-tenant migration, part A: add nullable user_id to every owner table.
-- Nullable first so existing rows survive; backfilled and set NOT NULL in a later
-- migration once the data layer scopes by user. FK is added via a guarded block so
-- re-runs are safe and the three strength tables (which already have the column but
-- no FK) pick one up too.
--
-- NOTE: repo migration files are idempotent documentation copies; the live DB is
-- the source of truth (applied via the Supabase MCP).

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
    'strength_progression_events'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I add column if not exists user_id uuid', t);
    if not exists (
      select 1 from information_schema.table_constraints
      where table_schema='public' and table_name=t
        and constraint_type='FOREIGN KEY' and constraint_name = t||'_user_id_fkey'
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (user_id) references auth.users(id) on delete cascade',
        t, t||'_user_id_fkey');
    end if;
    execute format('create index if not exists %I on public.%I (user_id)', t||'_user_id_idx', t);
  end loop;
end $$;
