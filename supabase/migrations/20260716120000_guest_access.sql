-- Single-row credential for temporary read-only guest access. One owner, one
-- credential; the app reads via the service role (bypasses RLS) but RLS is added
-- for defense in depth. token_version is bumped to revoke all live guest cookies.
create table if not exists public.guest_access (
  id            boolean primary key default true,      -- singleton (only 'true' allowed)
  owner_user_id uuid not null,
  enabled       boolean not null default false,
  password_hash text,                                  -- scrypt$salt$key (null = password login off)
  link_token    text,                                  -- opaque high-entropy (null = link login off)
  token_version integer not null default 1,            -- bump to invalidate outstanding cookies
  session_hours integer not null default 12,
  updated_at    timestamptz not null default now(),
  constraint guest_access_singleton check (id = true)
);

alter table public.guest_access enable row level security;
drop policy if exists own_rows on public.guest_access;
create policy own_rows on public.guest_access
  for all to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
