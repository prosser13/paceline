# Plan agent — operating contract

How a coaching session (a fresh Claude run each time) reads, reviews, and changes
the training plan. The session is **stateless**: it carries nothing between runs,
so everything it needs is in the data, and everything it does is recorded in the
data. This contract is the read it starts from and the rules it works within.

> Status legend: ✅ built · 🔜 forthcoming (next slices of the agent-enablement track).

---

## Auth

Both endpoints accept either a logged-in session (the app/UI) or a service token
for the headless coach: `Authorization: Bearer <PLAN_AGENT_TOKEN>`. The token must
match in Vercel (prod) and wherever the agent reads it.

## 0. The nightly evening coach ✅

The evening review can be generated **in-repo** on reliable infra, so it no longer
depends on the external `paceline-evening-coach` task firing at 9pm:

- `POST /api/coach/run` (auth: `CRON_SECRET` bearer, or a logged-in session) loads
  the briefing (`getPlanContext`) + the coach's rolling memory (`coach_context`),
  generates the review via the Claude API (`src/lib/coach-generate.ts`), writes it
  to `coach_messages` (with `kind='evening'`), fans it out to Telegram, and rewrites
  the memory. It's **idempotent** — a partial unique index on
  `coach_messages(for_date) WHERE kind='evening'` guarantees one evening review a day.
- `.github/workflows/evening-coach.yml` fires it several times across the 9pm slot
  (plus a late safety net that alerts on Telegram if the night still produced nothing).
  GitHub's scheduler can drop a run, so the spread + idempotency is the reliability
  mechanism.
- New prod env: `ANTHROPIC_API_KEY` (Vercel). `COACH_MODEL` optionally overrides the
  model. `CRON_SECRET` / `TELEGRAM_*` are already set for the wellness sync + fan-out.

## 1. Start here — the briefing read ✅

Load the whole picture in one call:

```
GET /api/plan-context[?as_of=YYYY-MM-DD]
```

or, server-side, `getPlanContext(asOf?)` from [`src/data/plan-context.ts`](../src/data/plan-context.ts).
It is a pure read — it never mutates. `as_of` defaults to today (UTC).

It returns one JSON object:

| Key | What it is |
|-----|-----------|
| `as_of` | The date the briefing is computed for |
| `plan` | The plan whose `[start_date, end_date]` contains `as_of` |
| `upcoming_races` | Race plans on/after `as_of`, soonest first |
| `current_week` | The `plan_weeks` row for `as_of` — phase, purpose, planned volume |
| `upcoming` | Next 14 days of `plan_sessions` — **the editable surface**. Each carries `id` (the change address), `structure`, `target_pace`, `estimated_tss`, `intensity`, `priority`, `status`, `rationale` |
| `recent` | Last 14 days, planned vs actual per session, with `adherence` (`done`/`missed`) and, for completed runs, a `pace_check` (prescribed zone + window, actual pace/zone as formatted `m:ss/km`, the avg HR + its HR zone, an `effort_note` when HR and pace diverge, and an on-plan/OUTSIDE-plan verdict) so zone adherence is judged by pace and effort by HR × pace, not the session's name |
| `wellness` | Cached intervals.icu form / fitness / fatigue (+ `stale` flag) |
| `zones` | Threshold pace, pace/HR/power zones — used to translate intent into targets |
| `constraints` | Standing scheduling limits the user set (see §3) |
| `coaching` | Autonomy + guardrails + standing guidance (see §3) |
| `recent_changes` | Tail of the change log — what prior passes did and why (§4) |
| `reference` | Static authoring aid: `session_schemas` (run vs strength `structure` shapes) + `exercise_catalog` (strength exercise ids + defaults) — so editing needs no code search |

Reason from this object. Don't re-derive it by querying tables piecemeal — the
point of one deterministic read is that every session starts from the same state.

---

## 2. The data model

The plan lives in three tiers, plus actuals:

- `plans` — the plan (race date, target time/pace, `strength_priority`, dates)
- `plan_weeks` — per-week phase and `purpose` (see below). `planned_volume_km` is
  **legacy**: weekly volume is now derived from the week's run sessions at read time
  (`src/lib/weekly-volume.ts` · `weekRunKm`), so nothing needs to update it and no
  view should render it.
- `plan_sessions` — individual sessions; `structure` (jsonb) is the per-segment
  prescription, `rationale` the "why", `status` the lifecycle, `priority` the
  A/B/C importance
- `completed_workouts` — Strava-matched actuals, linked by `plan_session_id`

**Keep `plan_weeks.purpose` qualitative.** It is a one-line intent for the week
("Final big load before taper", "Speed work and race tune-up"). Do **not** bake a
specific session distance into it ("… 30km long run …") — the distance lives on the
session, and duplicating it in prose is exactly what goes stale when a run changes.
The single-session mutation path can't rewrite prose, so it *warns* (see §4) when a
run changes under a purpose that still names a distance; qualitative purposes never
trip that warning because there's nothing to drift.

Session `id` is stable — it is how a change is addressed. Never rebuild a session
by delete+insert when an update will do; that breaks the actuals link and the
change log.

---

## 3. Inputs you must respect

These are user-owned and edited in **Settings** (`/settings`). Read them from the
briefing; never override them.

**Constraints** (`plan_constraints`) — hard scheduling limits:
- `recurring` — a weekday that's unavailable (e.g. Mondays off)
- `blackout` — a date range that's unavailable (travel, etc.)
- `note` — a free-text rule to honour

**Coaching preferences** (`coaching_prefs`):
- `autonomy` — how much you may change unprompted:
  - `propose` — suggest changes only; apply nothing without the user's OK
  - `auto_within_week` — you may reshuffle the current week; propose anything larger
  - `auto_full` — you may apply any change that stays within the guardrails below
- `max_weekly_ramp_pct` — cap on week-on-week volume increase
- `min_rest_days` — keep at least this many rest days per week
- `protect_priority_a` — when true, never move or alter A-priority sessions
- `notes` — standing guidance to always keep in mind

---

## 4. How to change the plan ✅

**All mutations go through one logged path** — never raw `UPDATE`s. Apply one
change to one session:

```
POST /api/plan-change
{
  "idempotency_key": "2026-06-28:ease-w4-long-run",   // unique per intent
  "actor": "claude",                                   // "claude" | "user"
  "reason": "Form is -25; trim the long run to protect recovery",
  "session_id": "<plan_sessions.id>",
  "patch": { "distance_km": 26, "estimated_tss": 150, "rationale": "…" }
}
```

(or `applyPlanChange(input)` from [`src/data/plan-mutations.ts`](../src/data/plan-mutations.ts).)

- **`patch`** may set only editable fields: `scheduled_date` (moving a session also
  re-derives `day_of_week`), `am_pm`, `session_type`, `activity_type`, `name`,
  `description`, `distance_km`, `warmup_km`, `cooldown_km`, `structure`,
  `target_pace`, `target_pace_end`, `estimated_tss`, `estimated_duration`,
  `intensity`, `profile_shape`, `week_phase`, `priority`, `status`, `rationale`,
  `notes`. Any other field rejects the whole change.
- **`idempotency_key`** makes re-runs safe: a repeated key returns
  `{ applied: false, status: "duplicate" }` and changes nothing. (A single Strava
  activity once double-logged across two yoga slots because dedup was keyed to the
  wrong thing — the key is that lesson, at plan scale.)
- Each apply records `before_state` / `after_state`, the reason, and the actor in
  `adjustment_logs` — enabling review and revert.

**Responses:** `applied` (done), `duplicate` (key already used), `proposal_only`
(autonomy is `propose` — surface it for approval, nothing changed), `rejected`
(an invariant or guardrail blocked it, with a reason). An `applied` response may
also carry `warnings: string[]` — the change went through, but something adjacent
may now need attention (e.g. the week `purpose` still names a distance after a run
changed). Read them and act on them in the same pass.

**Revert** a prior change:

```
POST /api/plan-change
{ "revert_adjustment_id": "<adjustment_logs.id>", "reason": "…" }
```

Replays the change's `before_state` and writes its own audit row. Idempotent per
source change.

**Enforced in code:**
- Never modifies a `completed` session or one dated before today; never moves a
  session into the past.
- Never changes a session's `id` (not an editable field).
- **Run structure must match its distance.** When a change touches a run's
  `structure` or `distance_km`, the two must agree (the structure's per-segment km
  sum to `distance_km`, within ~10%). A patch that would leave them inconsistent is
  `rejected` — patch both together, or fix the structure. (This is the session-
  internal half of the drift the weekly-volume derivation fixes at the week level.)
- For `actor: "claude"`: honours `autonomy` (`propose` → not applied;
  `auto_within_week` → must stay inside the current week) and `protect_priority_a`.
  User-initiated changes bypass these agent guardrails but not the safety invariants.

**Agent-respected (not code-enforced — they're week-level, not single-session):**
- `max_weekly_ramp_pct`, `min_rest_days`. Check these yourself against the briefing
  before issuing changes.
- Keep targets consistent with `zones` — derive paces/HR from the zone windows,
  don't invent them.
- Honour every `constraint` in §3.

### Session `structure` shapes

`structure` is jsonb, shaped differently by session type. Don't search the code —
the briefing's `reference` block carries both schemas and the exercise catalog.

- **Runs** — array of phases: `{ phase, description, pace_per_km ("m:ss"), duration_mins }`.
  Phase distances should sum to `distance_km`; `target_pace` is the headline/quality pace.
- **Strength / Core** — array of exercises: `{ name, sets, reps, reps_type ("reps"|"secs"),
  weight (kg or null), target, exercise_id }`. `exercise_id` comes from
  `reference.exercise_catalog` (id · name · group · default sets/reps/weight/equipment) —
  use a real id; don't invent one.

---

## 5. Human-facing surfaces

- **Edit the inputs** the agent reads: `/settings` (constraints, autonomy, zones,
  target times, strength priority).
- **View the plan** in human form: the dashboard (`/`) and plan page (`/plan`) —
  these *are* the rendered context; there's no separate "context" screen.
- **Review changes** the agent made: the change-log card in `/settings`
  ("Coaching · change log") — every change newest-first with its reason and an
  inline **Revert**.
- **Talk to your plan in Claude Desktop:** the local MCP bridge
  (`scripts/coach-mcp-server.mjs`) exposes `get_plan_context`, `apply_plan_change`,
  and `revert_plan_change` as tools, proxying these endpoints with `PLAN_AGENT_TOKEN`.
  Add it to `claude_desktop_config.json` (config in the script header). claude.ai
  web/mobile would instead need an OAuth remote connector — a later addition.
