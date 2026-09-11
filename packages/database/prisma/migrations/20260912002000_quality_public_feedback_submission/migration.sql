BEGIN;

ALTER TABLE quality_feedback_requests
  ADD COLUMN IF NOT EXISTS feedback_id TEXT,
  ADD COLUMN IF NOT EXISTS token_consumed_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS public_token_version INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS quality_feedback_requests_feedback_uq
  ON quality_feedback_requests(feedback_id)
  WHERE feedback_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS quality_feedback_requests_public_token_idx
  ON quality_feedback_requests(id, public_token_version, expires_at)
  WHERE status IN ('PENDING','SENT','OPENED') AND token_consumed_at IS NULL;

ALTER TABLE quality_feedback_requests
  ADD CONSTRAINT quality_feedback_requests_feedback_fkey
  FOREIGN KEY (feedback_id) REFERENCES customer_feedback(id)
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
