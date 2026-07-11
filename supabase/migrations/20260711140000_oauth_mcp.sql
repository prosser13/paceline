-- OAuth 2.1 (PKCE + Dynamic Client Registration) for the MCP server, so Claude's
-- connector flow (claude.ai web / desktop / mobile) can authorize against paceline.
-- All secrets are stored only as SHA-256 hashes. Service-role only (RLS on, no policy).

-- Dynamically-registered clients (Claude registers itself; public clients, no secret).
create table if not exists oauth_clients (
  client_id     text primary key,
  client_name   text,
  redirect_uris text[] not null,
  created_at    timestamptz not null default now()
);

-- Short-lived authorization codes bound to a user + PKCE challenge.
create table if not exists oauth_auth_codes (
  code_hash             text primary key,
  client_id             text not null,
  user_id               uuid not null references auth.users(id) on delete cascade,
  redirect_uri          text not null,
  code_challenge        text not null,
  code_challenge_method text not null default 'S256',
  resource              text,
  scope                 text,
  expires_at            timestamptz not null,
  created_at            timestamptz not null default now()
);

-- Issued access/refresh tokens → user.
create table if not exists oauth_tokens (
  access_token_hash  text primary key,
  refresh_token_hash text unique,
  client_id          text not null,
  user_id            uuid not null references auth.users(id) on delete cascade,
  scope              text,
  expires_at         timestamptz not null,
  created_at         timestamptz not null default now()
);

alter table oauth_clients    enable row level security;
alter table oauth_auth_codes enable row level security;
alter table oauth_tokens     enable row level security;
