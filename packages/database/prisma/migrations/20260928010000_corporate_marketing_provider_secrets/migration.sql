CREATE TABLE IF NOT EXISTS corporate_marketing_provider_secrets (
  connection_id TEXT PRIMARY KEY REFERENCES corporate_marketing_provider_connections(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  encrypted_payload TEXT NOT NULL,
  key_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS corporate_marketing_provider_secrets_scope_idx
  ON corporate_marketing_provider_secrets(tenant_id, company_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS corporate_marketing_provider_secrets_updated_idx
  ON corporate_marketing_provider_secrets(updated_at DESC);
