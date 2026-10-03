CREATE TABLE "cost_centers" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cost_centers_company_code_key" UNIQUE ("company_id", "code")
);

CREATE TABLE "cost_center_expense_links" (
  "journal_entry_line_id" TEXT NOT NULL,
  "cost_center_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "cost_center_expense_links_pkey" PRIMARY KEY ("journal_entry_line_id")
);

CREATE TABLE "cost_center_branch_allocations" (
  "cost_center_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "percent" DECIMAL(7,4) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "cost_center_branch_allocations_pkey" PRIMARY KEY ("cost_center_id", "branch_id"),
  CONSTRAINT "cost_center_branch_allocations_percent_check" CHECK ("percent" > 0 AND "percent" <= 100)
);

CREATE INDEX "cost_centers_tenant_company_active_idx"
  ON "cost_centers"("tenant_id", "company_id", "active");
CREATE INDEX "cost_center_expense_links_cost_center_idx"
  ON "cost_center_expense_links"("cost_center_id");
CREATE INDEX "cost_center_branch_allocations_branch_idx"
  ON "cost_center_branch_allocations"("branch_id");

ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_tenant_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_company_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cost_center_expense_links" ADD CONSTRAINT "cost_center_expense_links_line_fkey"
  FOREIGN KEY ("journal_entry_line_id") REFERENCES "journal_entry_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cost_center_expense_links" ADD CONSTRAINT "cost_center_expense_links_center_fkey"
  FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cost_center_branch_allocations" ADD CONSTRAINT "cost_center_branch_allocations_center_fkey"
  FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cost_center_branch_allocations" ADD CONSTRAINT "cost_center_branch_allocations_branch_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
