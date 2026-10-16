BEGIN;

ALTER TABLE quality_notification_outbox
  ADD COLUMN IF NOT EXISTS channel TEXT,
  ADD COLUMN IF NOT EXISTS provider_key TEXT,
  ADD COLUMN IF NOT EXISTS recipient_hash TEXT;

ALTER TABLE quality_notification_outbox
  DROP CONSTRAINT IF EXISTS quality_notification_outbox_channel_chk;
ALTER TABLE quality_notification_outbox
  ADD CONSTRAINT quality_notification_outbox_channel_chk
  CHECK (channel IS NULL OR channel IN ('EMAIL','SMS','WHATSAPP')) NOT VALID;

ALTER TABLE quality_notification_outbox_events
  ADD COLUMN IF NOT EXISTS channel TEXT,
  ADD COLUMN IF NOT EXISTS provider_key TEXT;

ALTER TABLE quality_notification_outbox_events
  DROP CONSTRAINT IF EXISTS quality_notification_outbox_events_channel_chk;
ALTER TABLE quality_notification_outbox_events
  ADD CONSTRAINT quality_notification_outbox_events_channel_chk
  CHECK (channel IS NULL OR channel IN ('EMAIL','SMS','WHATSAPP')) NOT VALID;

CREATE INDEX IF NOT EXISTS quality_notification_outbox_provider_idx
  ON quality_notification_outbox(tenant_id, company_id, provider_key, channel, status, created_at DESC);

COMMIT;
