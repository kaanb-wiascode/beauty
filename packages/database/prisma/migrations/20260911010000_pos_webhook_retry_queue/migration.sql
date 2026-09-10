ALTER TABLE pos_webhook_events
  DROP CONSTRAINT IF EXISTS pos_webhook_events_status_check;

ALTER TABLE pos_webhook_events
  ADD CONSTRAINT pos_webhook_events_status_check
  CHECK (status IN (
    'RECEIVED',
    'PROCESSING',
    'PROCESSED',
    'IGNORED',
    'FAILED',
    'RETRY_PENDING',
    'ENRICHMENT_PENDING',
    'DEAD_LETTER'
  ));

ALTER TABLE pos_webhook_events
  ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  ADD COLUMN next_retry_at TIMESTAMPTZ,
  ADD COLUMN last_attempt_at TIMESTAMPTZ,
  ADD COLUMN dead_letter_at TIMESTAMPTZ,
  ADD COLUMN claimed_at TIMESTAMPTZ,
  ADD COLUMN claim_token TEXT,
  ADD COLUMN replay_requested_at TIMESTAMPTZ;

CREATE INDEX pos_webhook_events_retry_due_idx
  ON pos_webhook_events(status,next_retry_at,created_at)
  WHERE status IN ('RETRY_PENDING','ENRICHMENT_PENDING');

CREATE INDEX pos_webhook_events_scope_audit_idx
  ON pos_webhook_events(tenant_id,company_id,branch_id,created_at DESC);
