-- Once-per-day dedupe for background-sync failure alerts, so a persistent failure
-- (e.g. a rotated intervals.icu API key that 401s every run) pings Telegram once a
-- day rather than on every scheduled fire. Keyed by alert kind.
create table if not exists public.sync_alerts (
  kind         text primary key,
  alerted_date date,
  updated_at   timestamptz not null default now()
);
alter table public.sync_alerts enable row level security;
