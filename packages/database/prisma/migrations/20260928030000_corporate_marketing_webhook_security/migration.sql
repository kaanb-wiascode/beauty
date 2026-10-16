ALTER TABLE corporate_marketing_provider_connections
  ADD COLUMN IF NOT EXISTS webhook_secret_hash TEXT NULL,
  ADD COLUMN IF NOT EXISTS webhook_configured_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS corporate_marketing_provider_connections_webhook_idx
  ON corporate_marketing_provider_connections(provider, webhook_configured_at)
  WHERE webhook_secret_hash IS NOT NULL;
