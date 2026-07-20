-- One source of truth for a race's distance. A race is defined by its `plans` row
-- (slug, date, distance, target); the scheduled RACE plan_session (matched by
-- race_slug = plans.slug) mirrored the distance separately, so correcting a race
-- distance meant editing both. Make plans.distance_km authoritative and sync it
-- down to the linked RACE session automatically.
--
-- Scope note: the match is race_slug = slug (the goal race), NOT plan_id — a
-- training plan also contains tune-up RACE sessions (a 10k, a 3k) with their own
-- slugs, which must keep their own distances.
--
-- Not synced: the session's per-km `structure` (a derived post-race splits cache).
-- Distances are set once at creation and rarely change, so on the odd correction
-- the per-km splits are refreshed through the existing "Load per-km splits" path.
--
-- Idempotent: re-running replaces the function and recreates the trigger.

create or replace function sync_race_session_distance()
returns trigger
language plpgsql
as $$
begin
  if new.distance_km is distinct from old.distance_km and new.slug is not null then
    update plan_sessions ps
      set distance_km = new.distance_km
      where ps.user_id = new.user_id
        and ps.race_slug = new.slug
        and ps.session_type = 'RACE'
        and ps.distance_km is distinct from new.distance_km;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_race_session_distance on plans;
create trigger trg_sync_race_session_distance
  after update of distance_km on plans
  for each row
  execute function sync_race_session_distance();

-- One-off backfill: align any RACE session whose distance drifted from its plan's
-- (a no-op today; establishes the invariant going forward).
update plan_sessions ps
set distance_km = p.distance_km
from plans p
where ps.session_type = 'RACE'
  and ps.race_slug = p.slug
  and ps.user_id = p.user_id
  and p.distance_km is not null
  and ps.distance_km is distinct from p.distance_km;
