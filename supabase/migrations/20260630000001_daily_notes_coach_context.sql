-- Athlete daily notes + the coach's rolling memory.
--
-- daily_notes  — the athlete's free-text note for a day (one row/day), entered on
--                the dashboard. Read by the evening-coach review.
-- coach_context — the coach's distilled, continuously-updated "athlete context"
--                summary (single row). Each evening the coach folds the day's note
--                into it and writes it back via /api/coach-context.
--
-- Single-tenant for now (no user_id) — consistent with the rest of the schema; the
-- multi-tenancy milestone adds user_id everywhere later.

create table if not exists daily_notes (
  note_date  date primary key,
  body       text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists coach_context (
  id           int  primary key default 1 check (id = 1),  -- single-row, like weighting_config
  summary      text not null default '',
  through_date date,                                        -- last day folded into the summary
  updated_at   timestamptz not null default now()
);

insert into coach_context (id) values (1) on conflict do nothing;
