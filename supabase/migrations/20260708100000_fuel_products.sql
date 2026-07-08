-- Fuel product picker (PB-campaign wave 5). A per-athlete catalog of gels/bars/
-- drinks (seeded with the athlete's products) that a completed long run's fuel log
-- draws from, plus the logged items + computed carbs/hour stored on the completion.
create table if not exists public.fuel_products (
  id          serial primary key,
  name        text not null,
  carbs_g     numeric not null,          -- carbs per unit (per bar / gel / serving)
  is_drink    boolean not null default false,
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  constraint fuel_products_name_key unique (name)
);

insert into public.fuel_products (name, carbs_g, is_drink, sort_order) values
  ('SIS Beta Fuel Bar', 46, false, 1),
  ('Hi5 Energy Gel',    23, false, 2),
  ('Hi5 Energy Drink',  44, true,  3)
on conflict (name) do nothing;

-- The logged fuel for a completion: fuel_items = [{name, carbs_g, qty}], and the
-- carbs/hour derived from total carbs ÷ moving time (stored so reads don't recompute).
alter table public.completed_workouts
  add column if not exists fuel_items       jsonb,
  add column if not exists fuel_carbs_per_h numeric;

alter table public.fuel_products enable row level security;
