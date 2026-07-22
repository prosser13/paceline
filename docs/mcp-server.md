# MCP server, OAuth 2.1, and read-only access modes

How Claude (claude.ai connector, Claude Desktop, or Claude Code) connects to a Paceline account as an
MCP client, plus the two non-Supabase read paths (guest + impersonation). For the plan-agent bearer
surface (`PLAN_AGENT_TOKEN`, the older headless coach), see [`plan-agent.md`](plan-agent.md) — that is a
separate, simpler surface.

## The MCP server (`POST /api/mcp`)

- **Transport:** Streamable HTTP, **stateless**. The client POSTs JSON-RPC 2.0; each request gets one
  JSON response (no SSE / session state). `GET` returns 405. Handler: `src/app/api/mcp/route.ts`;
  `maxDuration = 120` (the evening-review tool runs a two-stage generation).
- **Methods:** `initialize`, `ping`, `tools/list`, `tools/call`, and `notifications/*` (acked with 202).
- **Per-user scope:** the bearer token resolves to a `userId`; every tool runs inside
  `runWithUser(userId, …)` so the data layer reads/writes only that user's rows via `currentUserId()`
  (see architecture §9).

### Tools (`src/lib/mcp/tools.ts`)

The `TOOL_DEFS` / `WRITE_TOOL_DEFS` arrays are the source of truth; they map 1:1 to the
`mcp__paceline__*` tools a connected client sees.

- **Read (`TOOL_DEFS`):** `get_plan_context`, `list_sessions`, `get_recent_workouts`, `get_zones`,
  `get_races`.
- **Write (`WRITE_TOOL_DEFS`, only when the connection has write scope):** `apply_plan_change`,
  `add_plan_session`, `delete_plan_session`, `set_session_effort`, `set_daily_note`, `set_availability`,
  `set_race_target`, `set_threshold_pace`, `regenerate_coach_review`.
- `WRITE_TOOL_NAMES` gates both advertisement (`tools/list` hides write tools without write scope) and
  invocation (`tools/call` refuses a write tool on a read-only connection). Adding a tool = add a def
  (and, if mutating, add it to `WRITE_TOOL_DEFS`) and a `callTool` branch.

## Authentication — two token types

`POST /api/mcp` accepts **either** in `Authorization: Bearer …`:

1. **OAuth access token** (`pat_…`) from the connector flow below — `resolveAccessToken` (`data/oauth.ts`).
2. **Personal MCP token** (`pmcp_…`) minted in Settings → Claude (MCP) — `resolveMcpToken`
   (`data/mcp-tokens.ts`): `issueMcpToken(canWrite)` / `revokeMcpToken` / `getMcpTokenInfo`.

Both resolve to `{ userId, canWrite }`. All secrets (auth codes, access/refresh/personal tokens) are
stored **only as SHA-256 hashes**; plaintext is returned once at issue time. On a missing/invalid token
the server 401s with a `WWW-Authenticate: Bearer resource_metadata="…"` header pointing at the
protected-resource metadata, so a connector can discover the auth server (RFC 9728).

## OAuth 2.1 connector flow (public client, PKCE)

Store: `src/data/oauth.ts` (`oauth_clients` / `oauth_auth_codes` / `oauth_tokens`). No client secret —
possession of the code + PKCE `code_verifier` is the proof.

1. **Discovery** — `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource`
   (rewritten in `next.config.ts` to `/api/oauth/metadata/*`), RFC 8414 / 9728.
2. **Dynamic Client Registration** — `POST /api/oauth/register` (RFC 7591): Claude posts its
   `redirect_uris` (+ optional `client_name`), gets a `client_id`. Public client,
   `token_endpoint_auth_method: 'none'`. ⚠️ **Open and unthrottled**, and `client_name` is
   attacker-controllable — the consent screen labels it *unverified* and shows the redirect host
   (backlog: rate-limit + prune).
3. **Authorize** — `GET /oauth/authorize` (`src/app/oauth/authorize/`). Validates `client_id` +
   exact-match `redirect_uri` + `response_type=code` + `code_challenge` (S256 only); requires an
   **owner** browser session; shows consent (read, plus an opt-in write checkbox → `mcp:write` scope).
   Approving runs `decideAuthorization` (server action) which re-validates client/redirect/session,
   takes identity from the **session not the form**, and mints a PKCE-bound code
   (`createAuthCode`, 10-min TTL).
4. **Token** — `POST /api/oauth/token`: `authorization_code` grant exchanges code + `code_verifier`
   (PKCE S256) for an access token (1 h) + refresh token; `refresh_token` grant rotates.
   `consumeAuthCode` and `rotateRefreshToken` are **atomic** (delete-returning), so a concurrent replay
   can't mint two token pairs from one code/token. Refresh rotation is scoped to the presenting
   `client_id`. Scope is preserved across rotation (never escalated).

Anti-clickjacking: the whole app sends `X-Frame-Options: DENY` + `frame-ancestors 'none'`
(`next.config.ts`), so the consent screen can't be framed.

## Read-only access modes

Neither of these holds a Supabase account; both are **read-only** — every write gate resolves through
`getCurrentUser()` (`lib/auth.ts`), which returns null for both, so no mutation can land.

- **Guest** (`src/lib/guest.ts`, `src/data/guest-access.ts`, `POST /api/guest-login`, `/guest`): the
  owner sets a guest password (scrypt-hashed, `guest_access` singleton). Exchanging it sets an
  httpOnly **signed** cookie carrying only `{ v, exp }` (HMAC) — no user id. Each request re-resolves
  the owner server-side and re-checks `enabled` + `token_version`, so the owner can revoke instantly.
  `currentUserId()` scopes a guest's reads to the owner; `getViewer()` admits the guest as role
  `'guest'` for the read gate only.
- **Impersonation / "view as"** (`src/lib/impersonation.ts`): an **owner** can view another allowlisted
  user's data read-only (`VIEW_AS_COOKIE`, validated against `isImpersonatableTarget` each request).
  While impersonating, `getCurrentUser()` returns null (writes blocked) but `currentUserId()` returns
  the target id (reads scoped to them).
