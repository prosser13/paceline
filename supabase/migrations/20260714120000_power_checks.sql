-- Bike FTP auto-suggestion — mirrors threshold_checks. Every weekly check is
-- recorded (not just suggestions) with a plain-English commentary. The estimate
-- is intervals.icu eFTP (wellness_days.cycling_eftp_w); the setting compared
-- against is power_config.threshold_power.
--   outcome: suggested | within_noise | cooldown | no_fresh_evidence | taper_freeze
--            | lower_pending_confirmation | applied | dismissed
--   status:  none | pending | accepted | dismissed | reverted
-- NOTE: documentation copy of the live migration applied via the Supabase MCP.
create table if not exists public.power_checks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  checked_at   timestamptz not null default now(),
  week_start   date not null,
  current_w    numeric not null,
  estimate_w   numeric,
  gap_w        numeric,                 -- positive = eFTP higher than the setting
  outcome      text not null,
  commentary   text not null,
  evidence     jsonb,                   -- {label, eftp, date} + before/after on applied rows
  suggested_w  numeric,
  status       text not null default 'none',
  resolved_at  timestamptz
);
create index if not exists power_checks_user_week on public.power_checks (user_id, week_start desc);
alter table public.power_checks enable row level security;
drop policy if exists own_rows on public.power_checks;
create policy own_rows on public.power_checks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
