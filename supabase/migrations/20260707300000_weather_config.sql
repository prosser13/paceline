-- Training-location config for weather-adjusted paces (PB-campaign wave 4). Single
-- row. Daily heat-adjusted paces assume `home`; a temporary `override` covers
-- travel and is cleared back to home. `default_hour` is the athlete's usual run
-- hour (London), the start-hour dropdown's default.
create table if not exists public.weather_config (
  id            smallint primary key default 1 check (id = 1),
  home_lat      numeric,
  home_lng      numeric,
  home_label    text,
  override_lat  numeric,
  override_lng  numeric,
  override_label text,
  default_hour  smallint not null default 7 check (default_hour between 0 and 23),
  updated_at    timestamptz not null default now()
);
insert into public.weather_config (id) values (1) on conflict (id) do nothing;
alter table public.weather_config enable row level security;
