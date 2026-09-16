ALTER TABLE finance_integration_auth_sessions
  ADD COLUMN IF NOT EXISTS claim_token TEXT,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

CREATE INDEX IF NOT EXISTS finance_integration_auth_sessions_claim_idx
  ON finance_integration_auth_sessions(claimed_at)
  WHERE consumed_at IS NULL AND claim_token IS NOT NULL;
