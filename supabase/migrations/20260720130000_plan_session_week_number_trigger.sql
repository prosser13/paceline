-- Keep plan_sessions.week_number in sync with the session's date and the plan's
-- week calendar (plan_weeks). scheduled_date is the source of truth; week_number
-- is a denormalised cache read by the plan page, dashboard, races page, matching
-- and the coach. Before this, a cross-week reschedule (MCP apply_plan_change,
-- admin edit) updated day_of_week but not week_number, so a moved session could
-- render under the wrong week. This trigger recomputes week_number from the date
-- on every write path that can't be bypassed in app code.
--
-- Idempotent: re-running replaces the function and recreates the trigger.

create or replace function set_plan_session_week_number()
returns trigger
language plpgsql
as $$
declare
  wk integer;
begin
  -- Only derive when we have a date and a plan to look the calendar up against.
  -- If the date falls outside every defined week (e.g. moved beyond plan end) or
  -- the plan has no dated weeks, leave the existing week_number untouched.
  if new.scheduled_date is not null and new.plan_id is not null then
    select pw.week_number into wk
    from plan_weeks pw
    where pw.plan_id = new.plan_id
      and pw.date_from is not null and pw.date_to is not null
      and new.scheduled_date between pw.date_from and pw.date_to
    order by pw.week_number
    limit 1;
    if wk is not null then
      new.week_number := wk;
    end if;
  end if;
  return new;
end;
$$;

-- Fire only when the date (or the plan) changes, so an unrelated field edit — or a
-- deliberate manual week_number set — isn't clobbered. INSERT always fires.
drop trigger if exists trg_plan_session_week_number on plan_sessions;
create trigger trg_plan_session_week_number
  before insert or update of scheduled_date, plan_id on plan_sessions
  for each row
  execute function set_plan_session_week_number();

-- One-off backfill: realign every dated session whose stored week_number drifted
-- from the week its date actually falls in. Deterministic (each session matched to
-- its own plan's calendar) and idempotent (only rows that differ are written; this
-- UPDATE touches week_number only, so it does not re-fire the trigger above).
update plan_sessions s
set week_number = pw.week_number
from plan_weeks pw
where s.plan_id = pw.plan_id
  and s.scheduled_date is not null
  and pw.date_from is not null and pw.date_to is not null
  and s.scheduled_date between pw.date_from and pw.date_to
  and s.week_number is distinct from pw.week_number;
