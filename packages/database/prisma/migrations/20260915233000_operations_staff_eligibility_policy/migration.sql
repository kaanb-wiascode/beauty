CREATE TABLE "operations_staff_eligibility_policies" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'WARN',
  "require_published_shift" BOOLEAN NOT NULL DEFAULT TRUE,
  "require_service_certification" BOOLEAN NOT NULL DEFAULT TRUE,
  "require_competency" BOOLEAN NOT NULL DEFAULT TRUE,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operations_staff_eligibility_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operations_staff_eligibility_policies_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "operations_staff_eligibility_policies_company_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "operations_staff_eligibility_policies_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE,
  CONSTRAINT "operations_staff_eligibility_policies_mode_check" CHECK ("mode" IN ('OFF','WARN','BLOCK')),
  UNIQUE ("tenant_id", "company_id", "branch_id")
);

CREATE INDEX "operations_staff_eligibility_policies_scope_idx"
  ON "operations_staff_eligibility_policies"("tenant_id", "company_id", "branch_id");
