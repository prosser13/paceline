-- Per-athlete override for the race fluid gut-tolerance cap (ml/hr). Null = use the
-- app default (800 ml/h). A trained gut can push past the default. Idempotent.
alter table public.hydration_config
  add column if not exists gut_cap_ml numeric;
