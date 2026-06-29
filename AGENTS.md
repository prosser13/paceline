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

# Architecture

See [`docs/architecture.md`](docs/architecture.md) for the codebase map: the data model
(`plan_sessions` + `completed_workouts`, the two sport-dispatch axes), the **sport touch-point map**
(where to edit when adding a sport/metric), the page data-loading & caching patterns, the shared-utility
catalog (reuse these before writing new logic), and the multi-tenant migration recipe. Read it before
adding a feature.
