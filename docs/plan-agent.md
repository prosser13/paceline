# Plan agent — operating contract

How a coaching session (a fresh Claude run each time) reads, reviews, and changes
the training plan. The session is **stateless**: it carries nothing between runs,
so everything it needs is in the data, and everything it does is recorded in the
data. This contract is the read it starts from and the rules it works within.

> Status legend: ✅ built · 🔜 forthcoming (next slices of the agent-enablement track).

---

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
| `recent` | Last 14 days, planned vs actual per session, with `adherence` (`done`/`missed`) |
| `wellness` | Cached intervals.icu form / fitness / fatigue (+ `stale` flag) |
| `zones` | Threshold pace, pace/HR/power zones — used to translate intent into targets |
| `constraints` | Standing scheduling limits the user set (see §3) |
| `coaching` | Autonomy + guardrails + standing guidance (see §3) |
| `recent_changes` | Tail of the change log — what prior passes did and why (🔜 empty until §4 lands) |

Reason from this object. Don't re-derive it by querying tables piecemeal — the
point of one deterministic read is that every session starts from the same state.

---

## 2. The data model

The plan lives in three tiers, plus actuals:

- `plans` — the plan (race date, target time/pace, `strength_priority`, dates)
- `plan_weeks` — per-week phase, purpose, planned volume
- `plan_sessions` — individual sessions; `structure` (jsonb) is the per-segment
  prescription, `rationale` the "why", `status` the lifecycle, `priority` the
  A/B/C importance
- `completed_workouts` — Strava-matched actuals, linked by `plan_session_id`

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

## 4. How to change the plan 🔜

Not yet wired — documented here so it's built against a fixed contract.

**All mutations go through a single logged path** (`adjustment_logs`), never raw
`UPDATE`s. Each change records:

- the session(s) touched
- `before_state` / `after_state` (the diff) — enables review **and** revert
- a reason
- an actor (`claude` / `user`)
- an idempotency key — so the same intent in a new session can't double-apply

Re-running a coaching pass must be safe. (A single Strava activity once double-logged
across two yoga slots because dedup was keyed to the wrong thing — the same class of
bug at plan scale is what the idempotency key prevents.)

**Hard invariants** (independent of autonomy):
- Never modify a session with `status = 'completed'`, or any session dated before `as_of`.
- Never change a session's `id`.
- Keep targets consistent with `zones` — derive paces/HR from the zone windows,
  don't invent them.
- Respect every constraint and guardrail in §3.

---

## 5. Human-facing surfaces

- **Edit the inputs** the agent reads: `/settings` (constraints, autonomy, zones,
  target times, strength priority).
- **View the plan** in human form: the dashboard (`/`) and plan page (`/plan`) —
  these *are* the rendered context; there's no separate "context" screen.
- **Review changes** the agent made: 🔜 a read-only change-log card (after §4).
