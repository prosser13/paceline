-- Per-session manual override of the derived fuelling directive. null (default) =
-- no override, use the deterministic derivation (src/lib/fuel-progression.ts). A
-- jsonb {kind, gph} lets the athlete change or clear a day's directive (e.g. drop a
-- low-fuel protocol) via apply_plan_change's fuel_guidance patch key. The derivation
-- stays authoritative; this column is the explicit exception, resolved by
-- resolveFuelGuidance(override, derived).
--
-- Idempotent.
alter table plan_sessions add column if not exists fuel_override jsonb;
