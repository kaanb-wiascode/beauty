CREATE TABLE IF NOT EXISTS corporate_marketing_provider_campaigns (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  connection_id TEXT NOT NULL REFERENCES corporate_marketing_provider_connections(id) ON DELETE CASCADE,
  campaign_id TEXT NULL REFERENCES corporate_communication_campaigns(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  external_account_id TEXT NOT NULL,
  external_campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NULL,
  objective TEXT NULL,
  currency TEXT NULL,
  spend NUMERIC(18,2) NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  conversions NUMERIC(18,4) NOT NULL DEFAULT 0,
  conversion_value NUMERIC(18,2) NOT NULL DEFAULT 0,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(connection_id, external_campaign_id)
);

CREATE INDEX IF NOT EXISTS corporate_marketing_provider_campaigns_scope_idx
  ON corporate_marketing_provider_campaigns(tenant_id, company_id, provider, synced_at DESC);

CREATE INDEX IF NOT EXISTS corporate_marketing_provider_campaigns_campaign_idx
  ON corporate_marketing_provider_campaigns(campaign_id);

CREATE INDEX IF NOT EXISTS corporate_marketing_provider_campaigns_account_idx
  ON corporate_marketing_provider_campaigns(connection_id, external_account_id);
