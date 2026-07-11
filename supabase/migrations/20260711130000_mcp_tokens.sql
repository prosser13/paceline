-- Per-user bearer tokens for the read-only MCP server (/api/mcp). One token per
-- user (issuing replaces the prior one). Only the SHA-256 hash is stored — the
-- plaintext is shown once at issue time and never persisted. Service-role only
-- (RLS on, no policy); the data layer resolves token → user via supabaseAdmin.
create table if not exists mcp_tokens (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
alter table mcp_tokens enable row level security;
