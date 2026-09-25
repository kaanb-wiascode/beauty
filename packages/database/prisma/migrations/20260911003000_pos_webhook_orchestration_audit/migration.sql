ALTER TABLE pos_webhook_events
  ADD COLUMN pos_transaction_id TEXT REFERENCES pos_transactions(id) ON DELETE SET NULL,
  ADD COLUMN processing_result JSONB;

CREATE INDEX pos_webhook_events_pos_transaction_idx
  ON pos_webhook_events(pos_transaction_id,created_at DESC)
  WHERE pos_transaction_id IS NOT NULL;
