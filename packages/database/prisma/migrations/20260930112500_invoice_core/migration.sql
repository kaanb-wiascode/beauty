CREATE TYPE "InvoiceDirection" AS ENUM ('SALES', 'PURCHASE');
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');
CREATE TYPE "InvoiceSourceType" AS ENUM ('SALE', 'SUPPLIER_BILL', 'MANUAL');
CREATE TYPE "InvoiceLineKind" AS ENUM ('SERVICE', 'PACKAGE', 'PRODUCT', 'EXPENSE', 'OTHER');

CREATE TABLE "invoices" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "counterparty_id" TEXT NOT NULL,
  "direction" "InvoiceDirection" NOT NULL,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "source_type" "InvoiceSourceType" NOT NULL,
  "sale_id" TEXT,
  "supplier_bill_id" TEXT,
  "number" TEXT,
  "issue_date" DATE,
  "due_at" TIMESTAMPTZ,
  "currency" TEXT NOT NULL DEFAULT 'TRY',
  "subtotal" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "discount_total" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "tax_total" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "total" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "counterparty_name" TEXT NOT NULL,
  "counterparty_tax_number" TEXT,
  "counterparty_address" TEXT,
  "note" TEXT,
  "issued_at" TIMESTAMPTZ,
  "cancelled_at" TIMESTAMPTZ,
  "cancellation_reason" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoices_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "invoices_company_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "invoices_branch_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL,
  CONSTRAINT "invoices_counterparty_fkey"
    FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE RESTRICT,
  CONSTRAINT "invoices_sale_fkey"
    FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT,
  CONSTRAINT "invoices_supplier_bill_fkey"
    FOREIGN KEY ("supplier_bill_id") REFERENCES "supplier_bills"("id") ON DELETE RESTRICT,
  CONSTRAINT "invoices_amounts_check" CHECK (
    "subtotal" >= 0
    AND "discount_total" >= 0
    AND "tax_total" >= 0
    AND "total" >= 0
    AND "discount_total" <= "subtotal"
  ),
  CONSTRAINT "invoices_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "invoices_source_check" CHECK (
    ("source_type" = 'SALE' AND "sale_id" IS NOT NULL AND "supplier_bill_id" IS NULL AND "direction" = 'SALES')
    OR
    ("source_type" = 'SUPPLIER_BILL' AND "supplier_bill_id" IS NOT NULL AND "sale_id" IS NULL AND "direction" = 'PURCHASE')
    OR
    ("source_type" = 'MANUAL' AND "sale_id" IS NULL AND "supplier_bill_id" IS NULL)
  ),
  CONSTRAINT "invoices_issued_state_check" CHECK (
    ("status" = 'DRAFT' AND "issued_at" IS NULL AND "cancelled_at" IS NULL)
    OR
    ("status" = 'ISSUED' AND "number" IS NOT NULL AND "issue_date" IS NOT NULL AND "issued_at" IS NOT NULL AND "cancelled_at" IS NULL)
    OR
    ("status" = 'CANCELLED' AND "number" IS NOT NULL AND "issued_at" IS NOT NULL AND "cancelled_at" IS NOT NULL)
  )
);

CREATE TABLE "invoice_lines" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "invoice_id" TEXT NOT NULL,
  "line_no" INTEGER NOT NULL,
  "kind" "InvoiceLineKind" NOT NULL DEFAULT 'OTHER',
  "reference_id" TEXT,
  "description" TEXT NOT NULL,
  "quantity" NUMERIC(14,3) NOT NULL DEFAULT 1,
  "unit" TEXT,
  "unit_price" NUMERIC(14,4) NOT NULL DEFAULT 0,
  "discount_amount" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "tax_rate" NUMERIC(7,4) NOT NULL DEFAULT 0,
  "tax_amount" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "line_total" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoice_lines_invoice_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE,
  CONSTRAINT "invoice_lines_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "invoice_lines_amounts_check" CHECK (
    "unit_price" >= 0
    AND "discount_amount" >= 0
    AND "tax_rate" >= 0
    AND "tax_rate" <= 100
    AND "tax_amount" >= 0
    AND "line_total" >= 0
  )
);

CREATE UNIQUE INDEX "invoices_company_number_key"
  ON "invoices"("company_id","number")
  WHERE "number" IS NOT NULL;

CREATE UNIQUE INDEX "invoices_active_sale_source_key"
  ON "invoices"("sale_id")
  WHERE "sale_id" IS NOT NULL AND "status" <> 'CANCELLED';

CREATE UNIQUE INDEX "invoices_active_supplier_bill_source_key"
  ON "invoices"("supplier_bill_id")
  WHERE "supplier_bill_id" IS NOT NULL AND "status" <> 'CANCELLED';

CREATE INDEX "invoices_company_direction_status_idx"
  ON "invoices"("company_id","direction","status","issue_date");

CREATE INDEX "invoices_counterparty_date_idx"
  ON "invoices"("counterparty_id","issue_date");

CREATE UNIQUE INDEX "invoice_lines_invoice_line_no_key"
  ON "invoice_lines"("invoice_id","line_no");

CREATE INDEX "invoice_lines_reference_idx"
  ON "invoice_lines"("kind","reference_id");
