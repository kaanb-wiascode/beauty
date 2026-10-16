BEGIN;

ALTER TABLE corporate_brand_assets
  ADD COLUMN branch_id TEXT,
  ADD COLUMN mime_type TEXT,
  ADD COLUMN file_size_bytes BIGINT,
  ADD COLUMN width_px INTEGER,
  ADD COLUMN height_px INTEGER,
  ADD COLUMN duration_seconds NUMERIC(12,3),
  ADD COLUMN checksum_sha256 TEXT,
  ADD COLUMN rights_owner TEXT,
  ADD COLUMN license_expires_at TIMESTAMPTZ,
  ADD COLUMN tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE corporate_brand_assets
  ADD CONSTRAINT corporate_brand_asset_branch_fk
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;

ALTER TABLE corporate_brand_assets
  ADD CONSTRAINT corporate_brand_asset_file_size_nonnegative CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  ADD CONSTRAINT corporate_brand_asset_dimensions_positive CHECK (
    (width_px IS NULL OR width_px > 0) AND (height_px IS NULL OR height_px > 0)
  ),
  ADD CONSTRAINT corporate_brand_asset_duration_nonnegative CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  ADD CONSTRAINT corporate_brand_asset_checksum_format CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[0-9A-Fa-f]{64}$');

CREATE INDEX corporate_brand_asset_branch_idx
  ON corporate_brand_assets(tenant_id, company_id, branch_id, active, asset_type);
CREATE INDEX corporate_brand_asset_license_idx
  ON corporate_brand_assets(company_id, license_expires_at)
  WHERE active=TRUE AND license_expires_at IS NOT NULL;
CREATE UNIQUE INDEX corporate_brand_asset_checksum_uq
  ON corporate_brand_assets(company_id, checksum_sha256)
  WHERE checksum_sha256 IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_corporate_brand_asset_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM companies c
    WHERE c.id=NEW.company_id AND c."tenantId"=NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'corporate brand asset company scope mismatch';
  END IF;

  IF NEW.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM branches b
    WHERE b.id=NEW.branch_id AND b."companyId"=NEW.company_id
  ) THEN
    RAISE EXCEPTION 'corporate brand asset branch scope mismatch';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER corporate_brand_asset_scope_guard
BEFORE INSERT OR UPDATE ON corporate_brand_assets
FOR EACH ROW EXECUTE FUNCTION validate_corporate_brand_asset_scope();

COMMIT;
