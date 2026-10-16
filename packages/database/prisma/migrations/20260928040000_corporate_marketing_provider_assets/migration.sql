CREATE TABLE IF NOT EXISTS corporate_marketing_provider_assets (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  connection_id TEXT NOT NULL REFERENCES corporate_marketing_provider_connections(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  external_asset_id TEXT NOT NULL,
  name TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(connection_id, asset_type, external_asset_id)
);

CREATE INDEX IF NOT EXISTS corporate_marketing_provider_assets_scope_idx
  ON corporate_marketing_provider_assets(tenant_id, company_id, provider, asset_type, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS corporate_marketing_meta_page_unique_idx
  ON corporate_marketing_provider_assets(provider, asset_type, external_asset_id)
  WHERE provider='META' AND asset_type='PAGE' AND active=TRUE;
