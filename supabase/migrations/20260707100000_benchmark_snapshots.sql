-- Weekly benchmark snapshots (PB-campaign wave 2). One row per ISO week capturing
-- the blended predicted marathon time + the threshold pace it was computed from,
-- so the dashboard trajectory card and the Benchmarks page can draw a trend even
-- though threshold pace itself isn't otherwise historised. Written by the wellness
-- sync (idempotent upsert on week_start); read for the last ~12 weeks.
create table if not exists public.benchmark_snapshots (
  week_start        date primary key,          -- Monday of the ISO week
  predicted_seconds integer,                    -- blended predicted marathon finish
  threshold_min_km  numeric,                    -- threshold pace used (min/km)
  computed_at       timestamptz not null default now()
);

alter table public.benchmark_snapshots enable row level security;
-- No public policies: read/written only via the service-role client (supabaseAdmin).
