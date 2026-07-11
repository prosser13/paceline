-- Multi-tenant follow-up: make plans.slug unique PER USER instead of globally.
-- The original multi-tenant pass (20260711120100) converted the race_* slug uniques
-- to (user_id, slug) but left plans on a global UNIQUE(slug), so two athletes could
-- never share a race slug (e.g. both targeting "swansea-bay-10km"). getPlanBySlug
-- already scopes reads by user_id, so this only relaxes the cross-user collision.
-- Idempotent. NULL slugs (training-only plans) stay allowed, and several per user are
-- fine — the partial predicate keeps them out of the unique.
alter table public.plans drop constraint if exists plans_slug_unique;
create unique index if not exists plans_user_slug_uniq
  on public.plans (user_id, slug) where (slug is not null);
