CREATE TABLE "counterparties" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "tax_number" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "counterparties_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "counterparties_kind_check" CHECK ("kind" IN ('CUSTOMER','SUPPLIER')),
  CONSTRAINT "counterparties_status_check" CHECK ("status" IN ('ACTIVE','ARCHIVED')),
  CONSTRAINT "counterparties_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "counterparties_company_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "counterparties_company_kind_source_key"
  ON "counterparties"("company_id","kind","source_id");
CREATE INDEX "counterparties_company_kind_status_idx"
  ON "counterparties"("company_id","kind","status");
CREATE INDEX "counterparties_company_name_idx"
  ON "counterparties"("company_id","display_name");

INSERT INTO "counterparties"(
  "tenant_id","company_id","kind","source_id","display_name","phone","email","status"
)
SELECT
  c."tenantId",
  b."companyId",
  'CUSTOMER',
  c.id,
  CONCAT_WS(' ',c."firstName",c."lastName"),
  c.phone,
  c.email,
  'ACTIVE'
FROM "customers" c
JOIN "branches" b ON b.id=c."branchId"
ON CONFLICT ("company_id","kind","source_id") DO NOTHING;

INSERT INTO "counterparties"(
  "tenant_id","company_id","kind","source_id","display_name","phone","email","tax_number","status"
)
SELECT
  s.tenant_id,
  s.company_id,
  'SUPPLIER',
  s.id,
  s.name,
  s.phone,
  s.email,
  s.tax_number,
  CASE WHEN s.status='ACTIVE' THEN 'ACTIVE' ELSE 'ARCHIVED' END
FROM "inventory_suppliers" s
ON CONFLICT ("company_id","kind","source_id") DO NOTHING;

ALTER TABLE "sales"
  ADD COLUMN IF NOT EXISTS "counterpartyId" TEXT;

UPDATE "sales" s
SET "counterpartyId"=cp.id
FROM "counterparties" cp
JOIN "branches" b ON b."companyId"=cp.company_id
WHERE cp.kind='CUSTOMER'
  AND cp.source_id=s."customerId"
  AND b.id=s."branchId"
  AND s."counterpartyId" IS NULL;

ALTER TABLE "sales"
  ALTER COLUMN "counterpartyId" SET NOT NULL;

ALTER TABLE "sales"
  ADD CONSTRAINT "sales_counterpartyId_fkey"
  FOREIGN KEY ("counterpartyId") REFERENCES "counterparties"("id") ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS "sales_tenant_counterparty_idx"
  ON "sales"("tenantId","counterpartyId");

ALTER TABLE "supplier_bills"
  ADD COLUMN IF NOT EXISTS "counterparty_id" TEXT;

UPDATE "supplier_bills" b
SET "counterparty_id"=cp.id
FROM "counterparties" cp
WHERE cp.kind='SUPPLIER'
  AND cp.company_id=b.company_id
  AND cp.source_id=b.supplier_id
  AND b.counterparty_id IS NULL;

ALTER TABLE "supplier_bills"
  ALTER COLUMN "counterparty_id" SET NOT NULL;

ALTER TABLE "supplier_bills"
  ADD CONSTRAINT "supplier_bills_counterparty_fkey"
  FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS "supplier_bills_company_counterparty_idx"
  ON "supplier_bills"("company_id","counterparty_id");

CREATE OR REPLACE FUNCTION sync_customer_counterparty()
RETURNS TRIGGER AS $$
DECLARE
  company_id_value TEXT;
BEGIN
  IF TG_OP='DELETE' THEN
    UPDATE "counterparties"
    SET status='ARCHIVED', updated_at=NOW()
    WHERE kind='CUSTOMER' AND source_id=OLD.id;
    RETURN OLD;
  END IF;

  SELECT "companyId" INTO company_id_value
  FROM "branches"
  WHERE id=NEW."branchId";

  INSERT INTO "counterparties"(
    tenant_id,company_id,kind,source_id,display_name,phone,email,status
  )
  VALUES(
    NEW."tenantId",
    company_id_value,
    'CUSTOMER',
    NEW.id,
    CONCAT_WS(' ',NEW."firstName",NEW."lastName"),
    NEW.phone,
    NEW.email,
    'ACTIVE'
  )
  ON CONFLICT (company_id,kind,source_id)
  DO UPDATE SET
    display_name=EXCLUDED.display_name,
    phone=EXCLUDED.phone,
    email=EXCLUDED.email,
    status='ACTIVE',
    updated_at=NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customers_counterparty_sync_trigger ON "customers";
CREATE TRIGGER customers_counterparty_sync_trigger
AFTER INSERT OR UPDATE OF "firstName","lastName","phone","email","branchId" OR DELETE
ON "customers"
FOR EACH ROW
EXECUTE FUNCTION sync_customer_counterparty();

CREATE OR REPLACE FUNCTION sync_supplier_counterparty()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    UPDATE "counterparties"
    SET status='ARCHIVED', updated_at=NOW()
    WHERE company_id=OLD.company_id AND kind='SUPPLIER' AND source_id=OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO "counterparties"(
    tenant_id,company_id,kind,source_id,display_name,phone,email,tax_number,status
  )
  VALUES(
    NEW.tenant_id,
    NEW.company_id,
    'SUPPLIER',
    NEW.id,
    NEW.name,
    NEW.phone,
    NEW.email,
    NEW.tax_number,
    CASE WHEN NEW.status='ACTIVE' THEN 'ACTIVE' ELSE 'ARCHIVED' END
  )
  ON CONFLICT (company_id,kind,source_id)
  DO UPDATE SET
    display_name=EXCLUDED.display_name,
    phone=EXCLUDED.phone,
    email=EXCLUDED.email,
    tax_number=EXCLUDED.tax_number,
    status=EXCLUDED.status,
    updated_at=NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS suppliers_counterparty_sync_trigger ON "inventory_suppliers";
CREATE TRIGGER suppliers_counterparty_sync_trigger
AFTER INSERT OR UPDATE OF name,phone,email,tax_number,status OR DELETE
ON "inventory_suppliers"
FOR EACH ROW
EXECUTE FUNCTION sync_supplier_counterparty();

CREATE OR REPLACE FUNCTION assign_sale_counterparty()
RETURNS TRIGGER AS $$
DECLARE
  counterparty_id_value TEXT;
  company_id_value TEXT;
BEGIN
  SELECT "companyId" INTO company_id_value
  FROM "branches"
  WHERE id=NEW."branchId";

  SELECT id INTO counterparty_id_value
  FROM "counterparties"
  WHERE company_id=company_id_value
    AND kind='CUSTOMER'
    AND source_id=NEW."customerId"
  LIMIT 1;

  IF counterparty_id_value IS NULL THEN
    RAISE EXCEPTION 'Cari hesap kaydı oluşturulamadı.';
  END IF;

  NEW."counterpartyId" := counterparty_id_value;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sales_counterparty_assign_trigger ON "sales";
CREATE TRIGGER sales_counterparty_assign_trigger
BEFORE INSERT OR UPDATE OF "customerId","branchId"
ON "sales"
FOR EACH ROW
EXECUTE FUNCTION assign_sale_counterparty();

CREATE OR REPLACE FUNCTION assign_supplier_bill_counterparty()
RETURNS TRIGGER AS $$
DECLARE
  counterparty_id_value TEXT;
BEGIN
  SELECT id INTO counterparty_id_value
  FROM "counterparties"
  WHERE company_id=NEW.company_id
    AND kind='SUPPLIER'
    AND source_id=NEW.supplier_id
  LIMIT 1;

  IF counterparty_id_value IS NULL THEN
    RAISE EXCEPTION 'Cari hesap kaydı oluşturulamadı.';
  END IF;

  NEW.counterparty_id := counterparty_id_value;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS supplier_bills_counterparty_assign_trigger ON "supplier_bills";
CREATE TRIGGER supplier_bills_counterparty_assign_trigger
BEFORE INSERT OR UPDATE OF supplier_id,company_id
ON "supplier_bills"
FOR EACH ROW
EXECUTE FUNCTION assign_supplier_bill_counterparty();
