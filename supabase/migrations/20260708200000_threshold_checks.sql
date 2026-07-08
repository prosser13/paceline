-- Threshold auto-suggestion (docs/threshold-auto-suggestion.md). Every weekly
-- check is recorded — not just the ones that produce a suggestion — with a
-- plain-English commentary the athlete reads on the Benchmarks threshold card.
--   outcome: suggested | within_noise | capped_wait | cooldown | no_fresh_evidence
--            | taper_freeze | slower_pending_confirmation | applied | dismissed
--   status:  none (informational check) | pending | accepted | dismissed
create table if not exists public.threshold_checks (
  id               uuid primary key default gen_random_uuid(),
  checked_at       timestamptz not null default now(),
  week_start       date not null,
  current_min_km   numeric not null,
  estimate_min_km  numeric,
  gap_s            numeric,                -- positive = evidence says faster
  outcome          text not null,
  commentary       text not null,
  evidence         jsonb,                  -- [{label, impliedThresholdMinKm, weight}]
  suggested_min_km numeric,
  status           text not null default 'none',
  resolved_at      timestamptz
);
create index if not exists threshold_checks_week on public.threshold_checks (week_start desc);
alter table public.threshold_checks enable row level security;
