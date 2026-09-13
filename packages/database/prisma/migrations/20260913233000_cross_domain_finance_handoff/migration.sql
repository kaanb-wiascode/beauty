-- Cross-domain finance handoff foundation.
-- Operational domains create governed expense intents; Finance remains authoritative for AP/accounting posting.

ALTER TABLE "supplier_bills"
  ADD COLUMN IF NOT EXISTS "source_type" TEXT,
  ADD COLUMN IF NOT EXISTS "source_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "supplier_bills_source_unique"
  ON "supplier_bills"("company_id", "source_type", "source_id")
  WHERE "source_type" IS NOT NULL AND "source_id" IS NOT NULL;

ALTER TABLE "corporate_marketing_vendors"
  ADD COLUMN IF NOT EXISTS "supplier_id" TEXT REFERENCES "inventory_suppliers"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "corporate_marketing_vendors_supplier_idx"
  ON "corporate_marketing_vendors"("company_id", "supplier_id");

CREATE TABLE "corporate_marketing_expenses" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "branch_id" TEXT REFERENCES "branches"("id") ON DELETE SET NULL,
  "source_type" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "period_key" TEXT NOT NULL DEFAULT 'ONE_TIME',
  "vendor_id" TEXT REFERENCES "corporate_marketing_vendors"("id") ON DELETE SET NULL,
  "campaign_id" TEXT REFERENCES "corporate_communication_campaigns"("id") ON DELETE SET NULL,
  "supplier_id" TEXT REFERENCES "inventory_suppliers"("id") ON DELETE SET NULL,
  "supplier_bill_id" TEXT REFERENCES "supplier_bills"("id") ON DELETE SET NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" NUMERIC(14,2) NOT NULL CHECK ("amount" >= 0),
  "currency" TEXT NOT NULL DEFAULT 'TRY',
  "incurred_on" DATE NOT NULL DEFAULT CURRENT_DATE,
  "due_on" DATE,
  "invoice_number" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING_FINANCE',
  "expense_account_code" TEXT NOT NULL DEFAULT '760',
  "expense_account_name" TEXT NOT NULL DEFAULT 'Pazarlama Satış Dağıtım Giderleri',
  "created_by_user_id" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "approved_by_user_id" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "approved_at" TIMESTAMPTZ,
  "posted_at" TIMESTAMPTZ,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "corporate_marketing_expenses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "corporate_marketing_expenses_status_check" CHECK ("status" IN ('PENDING_FINANCE','APPROVED','POSTED','REJECTED','CANCELLED')),
  CONSTRAINT "corporate_marketing_expenses_source_check" CHECK ("source_type" IN ('CAMPAIGN','VENDOR','CREATOR','PR_MEDIA','OTHER'))
);

CREATE UNIQUE INDEX "corporate_marketing_expenses_source_period_unique"
  ON "corporate_marketing_expenses"("tenant_id","company_id","source_type","source_id","period_key");
CREATE INDEX "corporate_marketing_expenses_scope_idx"
  ON "corporate_marketing_expenses"("company_id","branch_id","status","incurred_on");
CREATE INDEX "corporate_marketing_expenses_bill_idx"
  ON "corporate_marketing_expenses"("supplier_bill_id");

-- Backfill active agency/vendor recurring fees into Finance handoff without posting accounting entries.
INSERT INTO "corporate_marketing_expenses"(
  tenant_id,company_id,branch_id,source_type,source_id,period_key,vendor_id,category,description,
  amount,currency,incurred_on,status,expense_account_code,expense_account_name,metadata
)
SELECT v.tenant_id,v.company_id,v.branch_id,'VENDOR',v.id,to_char(CURRENT_DATE,'YYYY-MM'),v.id,
       'AGENCY_FEE',v.name || ' aylık ajans/hizmet bedeli',v.monthly_fee,v.currency,CURRENT_DATE,
       'PENDING_FINANCE','760.04','Ajans ve Pazarlama Hizmet Giderleri',
       jsonb_build_object('backfilled',true,'paymentModel',v.payment_model)
FROM corporate_marketing_vendors v
WHERE v.status='ACTIVE' AND v.monthly_fee > 0
ON CONFLICT DO NOTHING;

-- Existing campaign spend becomes a Finance handoff item, not an automatic accounting posting.
INSERT INTO "corporate_marketing_expenses"(
  tenant_id,company_id,branch_id,source_type,source_id,period_key,campaign_id,category,description,
  amount,currency,incurred_on,status,expense_account_code,expense_account_name,metadata
)
SELECT c.tenant_id,c.company_id,c.branch_id,'CAMPAIGN',c.id,'LIFETIME',c.id,
       'AD_SPEND',c.name || ' reklam harcaması',c.spent_amount,c.currency,CURRENT_DATE,
       'PENDING_FINANCE','760.01','Dijital Reklam Giderleri',jsonb_build_object('backfilled',true)
FROM corporate_communication_campaigns c
WHERE c.spent_amount > 0
ON CONFLICT DO NOTHING;
