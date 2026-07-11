-- Multi-tenant finalization: user_id NOT NULL everywhere; singleton config tables
-- lose their id=1 column and become keyed by user_id; natural-key tables' PKs become
-- per-user composites (promoting the unique indexes created in part B). Runs after the
-- owner backfill, so no NULLs remain.
--
-- Idempotent: each PK promotion is guarded on the source unique index still existing
-- (promotion consumes/renames it), and id-column drops use IF EXISTS.

-- ── 1. user_id NOT NULL on every owner table ──
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
    execute format('alter table public.%I alter column user_id set not null', t);
  end loop;
end $$;

-- ── 2. singleton config tables: drop the id=1 column, promote user_id to PK ──
-- pairs of (table, unique-index-to-promote)
do $$
declare
  r record;
  pairs text[][] := array[
    array['hr_config','hr_config_user_uniq'],
    array['power_config','power_config_user_uniq'],
    array['bike_hr_config','bike_hr_config_user_uniq'],
    array['weather_config','weather_config_user_uniq'],
    array['coaching_prefs','coaching_prefs_user_uniq'],
    array['strength_tuning','strength_tuning_user_uniq'],
    array['coach_context','coach_context_user_uniq'],
    array['intervals_wellness_cache','intervals_wellness_cache_user_uniq'],
    array['strava_connection','strava_connection_user_uniq'],
    array['availability_review','availability_review_user_uniq']
  ];
begin
  for r in select pairs[i][1] as tbl, pairs[i][2] as idx from generate_subscripts(pairs,1) i loop
    execute format('alter table public.%I drop column if exists id cascade', r.tbl);
    if exists (select 1 from pg_class where relname = r.idx and relkind = 'i') then
      execute format('alter table public.%I add constraint %I primary key using index %I', r.tbl, r.tbl||'_pkey', r.idx);
    end if;
  end loop;
end $$;

-- ── 3. natural-key tables: PK becomes (user_id, natural key) ──
do $$
declare
  r record;
  pairs text[][] := array[
    array['app_config','app_config_user_key_uniq'],
    array['banner_dismissals','banner_dismissals_user_family_uniq'],
    array['benchmark_snapshots','benchmark_snapshots_user_week_uniq'],
    array['daily_notes','daily_notes_user_date_uniq'],
    array['sync_alerts','sync_alerts_user_kind_uniq'],
    array['wellness_days','wellness_days_user_date_uniq'],
    array['pace_zones','pace_zones_user_zone_uniq'],
    array['hr_zones','hr_zones_user_zone_uniq'],
    array['power_zones','power_zones_user_zone_uniq'],
    array['bike_hr_zones','bike_hr_zones_user_zone_uniq'],
    array['race_analyses','race_analyses_user_slug_uniq'],
    array['race_kit','race_kit_user_slug_uniq'],
    array['race_notes','race_notes_user_slug_uniq'],
    array['race_results','race_results_user_slug_uniq'],
    array['race_weather','race_weather_user_slug_uniq']
  ];
begin
  for r in select pairs[i][1] as tbl, pairs[i][2] as idx from generate_subscripts(pairs,1) i loop
    if exists (select 1 from pg_class where relname = r.idx and relkind = 'i') then
      execute format('alter table public.%I drop constraint if exists %I', r.tbl, r.tbl||'_pkey');
      execute format('alter table public.%I add constraint %I primary key using index %I', r.tbl, r.tbl||'_pkey', r.idx);
    end if;
  end loop;
end $$;
