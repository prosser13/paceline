-- Fluid intake tracking (sweat-rate model). Per-run weigh-in + fluid drunk, the
-- derived sweat rate, and the run's temperature (auto-fetched from the weather
-- archive, editable) — stored on the completion alongside the fuel columns.
-- Documentation copy of the live migration; idempotent.
alter table public.completed_workouts
  add column if not exists weight_before_kg   numeric,
  add column if not exists weight_after_kg    numeric,
  add column if not exists fluid_ml           numeric,   -- fluid drunk during the run (ml)
  add column if not exists sweat_rate_l_per_h numeric,   -- derived L/h (stored like fuel_carbs_per_h)
  add column if not exists run_temp_c         numeric;   -- auto-fetched, editable

-- Per-athlete hydration constant: sodium lost per litre of sweat (from a sweat
-- test). One row per user. Default 553 mg/L.
create table if not exists public.hydration_config (
  user_id           uuid    not null,
  sweat_sodium_mg_l numeric not null default 553,
  updated_at        timestamptz not null default now(),
  constraint hydration_config_user_key unique (user_id)
);

alter table public.hydration_config enable row level security;
drop policy if exists own_rows on public.hydration_config;
create policy own_rows on public.hydration_config
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
