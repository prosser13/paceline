-- Track Telegram delivery of the evening coach message, so a generated-but-
-- undelivered message can be retried by a later cron fire (delivery backup)
-- instead of being skipped because it already exists.
ALTER TABLE coach_messages ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
