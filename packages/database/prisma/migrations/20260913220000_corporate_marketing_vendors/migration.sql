BEGIN;

CREATE TABLE corporate_marketing_vendors (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  branch_id TEXT REFERENCES branches(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  vendor_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contract_starts_at DATE,
  contract_ends_at DATE,
  service_scope TEXT,
  monthly_fee NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TRY',
  payment_model TEXT NOT NULL DEFAULT 'MONTHLY_RETAINER',
  kpi_commitments JSONB NOT NULL DEFAULT '{}'::jsonb,
  performance_notes TEXT,
  attributed_revenue NUMERIC(18,2) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT corporate_marketing_vendors_type_check CHECK (
    vendor_type IN ('SOCIAL_MEDIA_AGENCY','AD_AGENCY','PRODUCTION','PHOTOGRAPHER','INFLUENCER_AGENCY','FREELANCER','PR_AGENCY','OTHER')
  ),
  CONSTRAINT corporate_marketing_vendors_status_check CHECK (
    status IN ('ACTIVE','PAUSED','ENDED','BLACKLISTED')
  ),
  CONSTRAINT corporate_marketing_vendors_payment_model_check CHECK (
    payment_model IN ('MONTHLY_RETAINER','PROJECT','PERFORMANCE','HOURLY','MIXED','OTHER')
  ),
  CONSTRAINT corporate_marketing_vendors_contract_check CHECK (
    contract_ends_at IS NULL OR contract_starts_at IS NULL OR contract_ends_at >= contract_starts_at
  ),
  CONSTRAINT corporate_marketing_vendors_amounts_check CHECK (
    monthly_fee >= 0 AND attributed_revenue >= 0
  )
);

CREATE INDEX corporate_marketing_vendors_scope_status_idx
  ON corporate_marketing_vendors(tenant_id, company_id, branch_id, status, updated_at DESC);
CREATE INDEX corporate_marketing_vendors_type_idx
  ON corporate_marketing_vendors(tenant_id, company_id, vendor_type, status);

CREATE OR REPLACE FUNCTION validate_corporate_marketing_vendor_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM companies c
    WHERE c.id=NEW.company_id AND c."tenantId"=NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'corporate marketing vendor company scope mismatch';
  END IF;

  IF NEW.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM branches b
    WHERE b.id=NEW.branch_id AND b."companyId"=NEW.company_id
  ) THEN
    RAISE EXCEPTION 'corporate marketing vendor branch scope mismatch';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER corporate_marketing_vendors_scope_guard
BEFORE INSERT OR UPDATE ON corporate_marketing_vendors
FOR EACH ROW EXECUTE FUNCTION validate_corporate_marketing_vendor_scope();

COMMIT;
