<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Running the dev server in a git worktree

A fresh worktree has no `node_modules` or `.env.local` (both gitignored), and
Turbopack won't follow a `node_modules` symlink out of the project root — so the
preview/dev server fails until they're set up locally. Run once per worktree:

```
node scripts/setup-worktree.mjs
```

This installs deps (offline-first from the warm npm cache) and copies `.env.local`
from the main checkout. Then `npm run dev` / the preview tool work as normal.

**Testing the UI as a logged-in user:** every authed page needs a Supabase session. Skip the
Google OAuth flow with the dev-only login bypass: `node scripts/setup-worktree.mjs` → start the
dev server → open `/api/dev-login?secret=<DEV_LOGIN_SECRET>` (read the value from `.env.local`).
It mints a real session for the test user (RLS + user-scoped data behave normally); it's
production-gated (404s on Vercel) and disabled unless `DEV_LOGIN_SECRET` is set.

# Architecture

See [`docs/architecture.md`](docs/architecture.md) for the codebase map: the data model
(`plan_sessions` + `completed_workouts`, the two sport-dispatch axes), the **sport touch-point map**
(where to edit when adding a sport/metric), units & timezone conventions, the page data-loading &
caching patterns, the shared-utility catalog (reuse these before writing new logic), the table→file
map for `src/data/`, the API-route/cron inventory, and the multi-tenant migration recipe. Read it
before adding a feature. Known bugs and agreed cleanups are in
[`docs/improvement-backlog.md`](docs/improvement-backlog.md) — check it before re-diagnosing an issue.

Other living docs: [`docs/ui-map.md`](docs/ui-map.md) (page → card → component → data, for UI
work), [`docs/prediction-models.md`](docs/prediction-models.md) (the prediction / threshold /
readiness / fuelling rules), [`docs/design-system.md`](docs/design-system.md) (theme tokens +
reusable components), [`docs/rtss.md`](docs/rtss.md) (TSS), and
[`docs/threshold-auto-suggestion.md`](docs/threshold-auto-suggestion.md).

# Quick facts (save yourself the archaeology)

- **Verify with:** `npx tsc --noEmit` · `npx eslint` · `npm run build`. There are **no tests and no CI**;
  the Vercel deploy build (push to `master`) is the only automated gate.
- **Pace units vary by layer** — min/km floats in `run-tss.ts`/`completed_workouts`, `"m:ss"` strings in
  zone rows/settings, s/km integers in `segment_actuals`. Check before converting (architecture.md §2).
- **Migrations:** applied to the live Supabase project via the Supabase MCP `apply_migration` tool;
  `supabase/migrations/` files are documentation copies, not a replayable history — the live DB is ahead
  of the repo. Query the live schema when it matters. Keep new migrations idempotent.
- **Scheduled jobs** (wellness sync, morning/evening coach) run on cron-job.org hitting `/api/*` with a
  `CRON_SECRET` bearer — not Vercel Cron, not GitHub Actions (those workflow files are manual-only relics).
- **`scripts/*.mjs` mutate the production DB** with the service-role key; the `gen-*` generators
  delete-and-reinsert whole plans. Don't run them casually.
