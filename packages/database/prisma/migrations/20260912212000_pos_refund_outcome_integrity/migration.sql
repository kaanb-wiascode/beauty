-- Preserve provider-side refund outcomes before local accounting and prevent
-- ambiguous provider responses from being treated as safely retryable failures.

ALTER TABLE pos_refund_requests
  ADD COLUMN IF NOT EXISTS provider_occurred_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_fee_amount NUMERIC(18,2);

ALTER TABLE pos_refund_requests
  DROP CONSTRAINT IF EXISTS pos_refund_requests_status_check;

ALTER TABLE pos_refund_requests
  ADD CONSTRAINT pos_refund_requests_status_check
    CHECK (status IN ('PROCESSING','PROVIDER_SUCCEEDED','SUCCEEDED','FAILED','REVIEW_REQUIRED'));

ALTER TABLE pos_refund_requests
  ADD CONSTRAINT pos_refund_requests_provider_fee_amount_check
    CHECK (provider_fee_amount IS NULL OR provider_fee_amount >= 0);

CREATE INDEX IF NOT EXISTS pos_refund_requests_review_required_idx
  ON pos_refund_requests(company_id, status, updated_at DESC)
  WHERE status='REVIEW_REQUIRED';
