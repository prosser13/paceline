-- Give public.exercises.id a sequence-backed default so new inserts (the
-- add_exercise MCP tool / addExercise data fn) don't need a manually-computed id.
-- Applied to the live project via the Supabase MCP; this is an idempotent copy.
create sequence if not exists public.exercises_id_seq owned by public.exercises.id;
select setval('public.exercises_id_seq', (select coalesce(max(id), 1) from public.exercises), true);
alter table public.exercises alter column id set default nextval('public.exercises_id_seq');
