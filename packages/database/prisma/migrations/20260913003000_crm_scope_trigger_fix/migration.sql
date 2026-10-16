CREATE OR REPLACE FUNCTION validate_crm_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "companies" c
    WHERE c."id" = NEW."company_id" AND c."tenantId" = NEW."tenant_id"
  ) OR NOT EXISTS (
    SELECT 1 FROM "branches" b
    WHERE b."id" = NEW."branch_id" AND b."companyId" = NEW."company_id"
  ) THEN
    RAISE EXCEPTION 'crm organization scope mismatch';
  END IF;

  IF NEW."customer_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "customers" c
    WHERE c."id" = NEW."customer_id"
      AND c."tenantId" = NEW."tenant_id"
      AND c."branchId" = NEW."branch_id"
  ) THEN
    RAISE EXCEPTION 'crm customer scope mismatch';
  END IF;

  IF TG_TABLE_NAME = 'crm_opportunities' THEN
    IF NEW."lead_id" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "crm_leads" l
      WHERE l."id" = NEW."lead_id"
        AND l."tenant_id" = NEW."tenant_id"
        AND l."company_id" = NEW."company_id"
        AND l."branch_id" = NEW."branch_id"
    ) THEN
      RAISE EXCEPTION 'crm lead scope mismatch';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;