# Exercise catalog

The library of strength / mobility / yoga moves the session builder and coach draw from.

## Where it lives — one source of truth

The catalog **is** the `public.exercises` table in Supabase. There is no generated file and no
sync step: the app reads the table at runtime. Add a row → it's live. (Historically it was a
generated `src/data/strength-exercises.ts` constant kept in sync by `scripts/pull-exercises.mjs`;
both are gone, and with them the drift risk where hand-added entries could be dropped on
regeneration.)

- **Global, not per-user.** `public.exercises` has no `user_id`; every athlete sees the same
  catalog. Adding an exercise affects everyone.
- **`id` auto-assigns** from `exercises_id_seq` (a sequence default) — you never set it by hand.
- **`is_active`** — soft-delete flag. Only `is_active = true` rows are served; flip it to `false`
  to retire a move without deleting history that references its id.

## How the app reads it — `src/data/exercises.ts`

| Export | Returns | Notes |
|---|---|---|
| `getExerciseCatalog()` | `Promise<Exercise[]>` | active catalog, sorted by group then name |
| `getExerciseById()` | `Promise<Map<number, Exercise>>` | id → `Exercise` lookup |
| `addExercise(input)` | `Promise<{ id, name }>` | validated insert (see below) |

Caching: the load is `unstable_cache`d under the **`exercises`** tag (1 h revalidate) and deduped
per request via React `cache()`. `addExercise` calls `revalidateTag('exercises', 'max')` so a new
move is visible immediately; a row inserted by other means (raw SQL) appears within the revalidate
window, or instantly after any `addExercise` call. `Exercise` (the shape) is defined in
`src/data/strength.ts`; `rowToExercise` in `exercises.ts` maps a DB row to it.

## Adding an exercise

### 1. The `add_exercise` MCP tool (recommended)

A **write-scoped** tool on the paceline MCP server — connect Claude with write access and ask it to
add the move; it validates, applies defaults, auto-assigns the id, and returns `{ id, name }`. It
rejects a duplicate name or an unknown enum value with a clear message.

### 2. Raw SQL (equivalent, for a bulk load)

```sql
insert into public.exercises
  (name, muscle_group, additional_muscle_groups, movement_pattern, supported_intents,
   reps_type, sets, reps_value, weight_kg, weight_type, strength_reps_min, strength_reps_max,
   strength_weight_kg, secs_per_rep, rest_per_set, duration_seconds, cue, frequency,
   is_single_leg, youtube_url, is_active)
values ('…', 'glutes', '{}', 'activation', '{maintain,balanced}', 'reps', 2, 15,
   null, null, null, null, null, 2, 30, 120, '…cue…', '3x_weekly', false, null, true);
-- id auto-assigns; omit it.
```

## Field reference

Required: **name, muscle_group, movement_pattern, supported_intents, reps_type, sets, reps_value.**
Everything else is optional with the default shown. (MCP tool fields are snake_case, matching the DB;
the `Exercise` TS type / `AddExerciseInput` use camelCase — e.g. `muscle_group` ↔ `group`/`muscleGroup`.)

| Field (DB / MCP) | `Exercise` | Type / allowed values | Default | Meaning |
|---|---|---|---|---|
| `name` | `name` | string, unique | — | Display name, e.g. "Bent-knee calf raise". |
| `muscle_group` | `group` | `calves` · `glutes` · `hamstrings` · `quads` · `core` · `hip-flexors` · `upper-body` | — | Primary group. |
| `additional_muscle_groups` | `additionalGroups` | array of the above | `[]` | Secondary groups worked. |
| `movement_pattern` | `movementPattern` | `hinge` · `squat` · `single_leg` · `push` · `pull` · `carry` · `core` · `activation` · `mobility` | — | How it loads. Stretches/flows are `mobility`. |
| `supported_intents` | `supportedIntents` | array of `strength` · `maintain` · `mobility` · `balanced` · `yoga` (non-empty) | — | Which session types may select it. Training moves: `strength`/`maintain`/`balanced`. Stretches: `mobility`. Yoga poses: `yoga`. |
| `reps_type` | `repsType` | `reps` · `secs` | — | Counted reps, or a timed hold. |
| `sets` | `sets` | integer > 0 | — | Default sets. |
| `reps_value` | `repsValue` | integer > 0 | — | Reps per set (`reps`), **or hold length in seconds** (`secs`). |
| `weight_kg` | `weightKg` | number \| null | `null` | Working default load (null = bodyweight/band). |
| `weight_type` | `weightType` | `dumbbells` · `barbell` · null | `null` | Equipment for the load. Bands/bodyweight are `null`. |
| `strength_reps_min` / `strength_reps_max` | `strengthRepsMin/Max` | integer \| null | `null` | Rep range for the heavier **strength-intent** target. |
| `strength_weight_kg` | `strengthWeightKg` | number \| null | `null` | Load for the strength-intent target (usually above `weight_kg`). |
| `secs_per_rep` | `secsPerRep` | integer \| null | `3` (reps) / `null` (secs) | Per-rep tempo. Feeds the duration estimate. |
| `rest_per_set` | `restPerSet` | integer \| null | `45` (reps) / `30` (secs) | Rest between sets. |
| `duration_seconds` | `durationSeconds` | integer \| null | auto | Time-budget estimate. Auto = `sets × (reps × secsPerRep + rest)` for reps, `sets × (hold + rest)` (×2 if single-leg) for holds. |
| `cue` | `cue` | string | `''` | Short coaching cue shown in the session. |
| `frequency` | `frequency` | `daily` · `3x_weekly` · `weekly` · null | `3x_weekly` | How often it's suitable. |
| `is_single_leg` | `isSingleLeg` | boolean | `false` | Performed one side at a time. |
| `youtube_url` | `youtubeUrl` | string \| null | `null` | Optional demo video. |

**Loaded vs bodyweight.** For a loaded move set `weight_type` + `weight_kg`, and (for a strength
lift) `strength_reps_min/max` + `strength_weight_kg` for its heavier target. For bodyweight/band
work leave all four null. **Bands** have no resistance field — encode band strength in the `name`
(e.g. "Banded lateral walk (light band)"), matching the existing catalog convention for variants.

## Touch-point map (if you change the shape)

- `src/data/exercises.ts` — the accessor, the `SELECT` column list, `rowToExercise`, `addExercise`,
  and the exported enum arrays (`MUSCLE_GROUPS`, …). Keep these in step with the type unions in
  `src/data/strength.ts`.
- `src/lib/mcp/tools.ts` — the `add_exercise` tool schema + handler (uses those enum arrays, so it
  can't drift).
- The `Exercise` type + resolver logic live in `src/data/strength.ts` (pure, DB-free).
