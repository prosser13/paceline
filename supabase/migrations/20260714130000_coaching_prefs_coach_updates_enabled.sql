-- Master toggle for the coach messages feature (morning + evening coach → the
-- dashboard "From your coach" card + Telegram). Distinct from morning_briefing,
-- which only gates the morning briefing. Default on; effective value can be forced
-- off for locked accounts (roles.ts coachUpdatesLocked), enforced in app code.
-- NOTE: documentation copy of the live migration applied via the Supabase MCP.
alter table public.coaching_prefs
  add column if not exists coach_updates_enabled boolean not null default true;
