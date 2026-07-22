# Paceline

A multi-tenant training-plan app: each allowlisted account gets a periodised
training plan with pace/HR zones, a daily agenda dashboard, Strava activity sync,
intervals.icu fitness/form, a strength-session builder, and a per-user AI coach.
Claude can also connect as an MCP client (see [`docs/mcp-server.md`](docs/mcp-server.md)).

## Stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript** (strict)
- **Tailwind CSS v4** — configured in `globals.css` via `@theme`, no `tailwind.config.js`
- **Supabase** — auth + Postgres (two clients: user-scoped `supabase-server`, RLS-bypassing `supabase-admin`)
- **Strava** + **intervals.icu** integrations · **Telegram** coach delivery
- Deploys to **Vercel** (push to `master` auto-deploys)

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000
```

`npm run build` · `npm run lint` for production build / linting.

See [.env.example](.env.example) for the required environment variables, and
[`docs/architecture.md`](docs/architecture.md) §11 for the full env inventory
(Supabase, Strava, Telegram, Anthropic, cron/agent secrets, dev-login).

## Architecture notes

- **Data access** lives in `src/data/*` — one module per table (plans, zones,
  plan-sessions, strength-sessions, strava-connection, …). Pages/actions call
  these rather than querying Supabase directly, which keeps per-table access in
  one place; each query is scoped to the current user via `currentUserId()`.
- **`src/proxy.ts`** (Next 16's renamed middleware) refreshes the Supabase
  session on each request.
- The admin CMS (`/admin`) and the Strava sync engine (`src/lib/strava.ts`) use
  the admin client directly by design (cross-user / server-only).
- See `AGENTS.md` — this is Next.js 16 with breaking changes from earlier
  versions; check `node_modules/next/dist/docs/` before relying on older APIs.
