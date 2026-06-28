-- Generalise adjustment_logs from the old "adjust-today chip" log into the single
-- logged mutation path for the plan agent. Every plan change (by the agent or the
-- user) records here with before/after, a reason, an actor, and an idempotency key
-- so a re-run can't double-apply and any change can be reverted. See docs/plan-agent.md.

ALTER TABLE adjustment_logs
  ALTER COLUMN chip_used DROP NOT NULL,                          -- legacy; agent edits use reason/operation
  ADD COLUMN IF NOT EXISTS actor           text NOT NULL DEFAULT 'user',   -- 'user' | 'claude'
  ADD COLUMN IF NOT EXISTS operation       text NOT NULL DEFAULT 'update',  -- 'update' | 'revert' (create/delete later)
  ADD COLUMN IF NOT EXISTS reason          text,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

-- One change per intent: a repeated key (a re-run of the same coaching pass) is a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS adjustment_logs_idempotency_key
  ON adjustment_logs (idempotency_key) WHERE idempotency_key IS NOT NULL;
