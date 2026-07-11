-- Multi-tenant migration, part B: per-user unique indexes the data layer upserts
-- against, plus the user_integrations table (per-user intervals.icu + Telegram
-- creds) and a strava_connection athlete-id index so the webhook can route inbound
-- events to the owning user. The pre-existing natural-key PKs stay until backfill
-- (a later migration) — only one user exists during this window, so they still
-- enforce correct single-user uniqueness.

-- ── singleton config tables: one row per user ──
create unique index if not exists hr_config_user_uniq            on public.hr_config (user_id);
create unique index if not exists power_config_user_uniq         on public.power_config (user_id);
create unique index if not exists bike_hr_config_user_uniq       on public.bike_hr_config (user_id);
create unique index if not exists weather_config_user_uniq       on public.weather_config (user_id);
create unique index if not exists coaching_prefs_user_uniq       on public.coaching_prefs (user_id);
create unique index if not exists strength_tuning_user_uniq      on public.strength_tuning (user_id);
create unique index if not exists coach_context_user_uniq        on public.coach_context (user_id);
create unique index if not exists intervals_wellness_cache_user_uniq on public.intervals_wellness_cache (user_id);
create unique index if not exists strava_connection_user_uniq    on public.strava_connection (user_id);
create unique index if not exists availability_review_user_uniq  on public.availability_review (user_id);

-- ── natural-key tables: uniqueness becomes per-user ──
create unique index if not exists app_config_user_key_uniq       on public.app_config (user_id, key);
create unique index if not exists pace_zones_user_zone_uniq      on public.pace_zones (user_id, zone_key);
create unique index if not exists hr_zones_user_zone_uniq        on public.hr_zones (user_id, zone_key);
create unique index if not exists power_zones_user_zone_uniq     on public.power_zones (user_id, zone_key);
create unique index if not exists bike_hr_zones_user_zone_uniq   on public.bike_hr_zones (user_id, zone_key);
create unique index if not exists daily_notes_user_date_uniq     on public.daily_notes (user_id, note_date);
create unique index if not exists wellness_days_user_date_uniq   on public.wellness_days (user_id, date);
create unique index if not exists sync_alerts_user_kind_uniq     on public.sync_alerts (user_id, kind);
create unique index if not exists banner_dismissals_user_family_uniq on public.banner_dismissals (user_id, family);
create unique index if not exists benchmark_snapshots_user_week_uniq on public.benchmark_snapshots (user_id, week_start);
-- NOTE: availability has multiple rows per date (by kind), so it gets NO per-date
-- unique index — its writer replaces a day by delete-then-insert, not upsert.
create unique index if not exists race_results_user_slug_uniq    on public.race_results (user_id, slug);
create unique index if not exists race_notes_user_slug_uniq      on public.race_notes (user_id, slug);
create unique index if not exists race_kit_user_slug_uniq        on public.race_kit (user_id, slug);
create unique index if not exists race_weather_user_slug_uniq    on public.race_weather (user_id, slug);
create unique index if not exists race_analyses_user_slug_uniq   on public.race_analyses (user_id, slug);

-- coach_messages: one evening + one morning per user per day (replaces the global ones)
drop index if exists public.coach_messages_evening_per_day;
drop index if exists public.coach_messages_morning_per_day;
create unique index if not exists coach_messages_user_evening_per_day
  on public.coach_messages (user_id, for_date) where (kind = 'evening');
create unique index if not exists coach_messages_user_morning_per_day
  on public.coach_messages (user_id, for_date) where (kind = 'morning');

-- strava webhook routes inbound events by athlete_id → owning user
create unique index if not exists strava_connection_athlete_uniq
  on public.strava_connection (athlete_id) where (athlete_id is not null);

-- ── per-user integration credentials (replaces env INTERVALS_API_KEY, the
-- hardcoded intervals athlete id, and env TELEGRAM_CHAT_ID) ──
create table if not exists public.user_integrations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  intervals_api_key text,
  intervals_athlete_id text,
  telegram_chat_id text,
  intervals_workout_sync boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_integrations enable row level security;
