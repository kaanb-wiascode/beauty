BEGIN;

ALTER TABLE "crm_opportunities"
  ADD COLUMN "sale_id" TEXT,
  ADD COLUMN "commercial_snapshot" JSONB,
  ADD COLUMN "converted_at" TIMESTAMPTZ;

ALTER TABLE "crm_opportunities"
  ADD CONSTRAINT "crm_opportunities_sale_id_fkey"
  FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT;

CREATE UNIQUE INDEX "crm_opportunities_sale_id_key"
  ON "crm_opportunities"("sale_id")
  WHERE "sale_id" IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_crm_opportunity_sale_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."sale_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "sales" s
    WHERE s."id" = NEW."sale_id"
      AND s."tenantId" = NEW."tenant_id"
      AND s."branchId" = NEW."branch_id"
      AND s."customerId" = NEW."customer_id"
  ) THEN
    RAISE EXCEPTION 'crm opportunity sale scope mismatch';
  END IF;

  IF NEW."sale_id" IS NULL AND (NEW."commercial_snapshot" IS NOT NULL OR NEW."converted_at" IS NOT NULL) THEN
    RAISE EXCEPTION 'crm opportunity sale metadata requires sale linkage';
  END IF;

  IF NEW."sale_id" IS NOT NULL AND (NEW."commercial_snapshot" IS NULL OR NEW."converted_at" IS NULL) THEN
    RAISE EXCEPTION 'crm opportunity sale linkage requires commercial snapshot and conversion timestamp';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "crm_opportunities_sale_scope_guard"
BEFORE INSERT OR UPDATE ON "crm_opportunities"
FOR EACH ROW EXECUTE FUNCTION validate_crm_opportunity_sale_scope();

COMMIT;
