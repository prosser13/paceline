-- Close the id gap in public.exercises: the gym-lift + prehab block lived at
-- 200-209 while the catalog was otherwise contiguous up to ~130, leaving a hole
-- in the middle. Shift 200-209 → 131-140 (subtract 69) so ids are sequential.
--
-- Applied to the live project via the Supabase MCP; this is an idempotent doc
-- copy. Safe to no-op re-run: the WHERE clauses only match rows still in 200-209,
-- and after the shift there are none.
--
-- Ordering matters: rewrite the referencing jsonb first, then the exercises rows,
-- then re-anchor the sequence. plan_sessions.structure holds an array of segment
-- objects, some with an exercise_id; only array-shaped structures are touched.

begin;

-- 1. plan_sessions.structure: subtract 69 from any exercise_id in 200-209,
--    preserving segment order.
with targets as (
  select id, structure
  from public.plan_sessions
  where jsonb_typeof(structure) = 'array'
    and structure::text ~ '"exercise_id"\s*:\s*20[0-9]'
),
rewritten as (
  select t.id,
         (
           select jsonb_agg(
             case
               when (elem->>'exercise_id') ~ '^20[0-9]$'
                 then jsonb_set(elem, '{exercise_id}', to_jsonb((elem->>'exercise_id')::int - 69))
               else elem
             end
             order by ord
           )
           from jsonb_array_elements(t.structure) with ordinality as e(elem, ord)
         ) as structure
  from targets t
)
update public.plan_sessions p
set structure = r.structure
from rewritten r
where p.id = r.id;

-- 2. The catalog rows themselves.
update public.exercises set id = id - 69 where id between 200 and 209;

-- 3. Any logged/strength references (0 rows today, but kept for completeness).
update public.strength_session_exercises set exercise_id = exercise_id - 69 where exercise_id between 200 and 209;
update public.strength_exercise_state     set exercise_id = exercise_id - 69 where exercise_id between 200 and 209;
update public.strength_progression_events set exercise_id = exercise_id - 69 where exercise_id between 200 and 209;

-- 4. Re-anchor the id sequence to the new max so the next auto-id is 141.
select setval('public.exercises_id_seq', (select max(id) from public.exercises), true);

commit;
