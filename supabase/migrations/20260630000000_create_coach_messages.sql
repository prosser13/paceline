-- Evening-coach messages (the 9pm review). Written by the paceline-evening-coach
-- scheduled task via /api/coach-message; the dashboard's "From your coach" card
-- shows the latest. Read/written only via the service-role client (bypasses RLS).
create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  for_date date not null,
  headline text not null,
  body_md text not null
);
comment on table public.coach_messages is 'Evening-coach messages (the 9pm review). Written by the paceline-evening-coach scheduled task via /api/coach-message; the dashboard shows the latest.';
alter table public.coach_messages enable row level security;
-- No public policies: app reads/writes only via the service-role client (supabaseAdmin).
