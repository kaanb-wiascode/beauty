BEGIN;

CREATE TABLE "crm_automation_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE RESTRICT,
  "branch_id" TEXT NOT NULL REFERENCES "branches"("id") ON DELETE RESTRICT,
  "origin" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "scanned" INTEGER NOT NULL DEFAULT 0,
  "created" INTEGER NOT NULL DEFAULT 0,
  "skipped" INTEGER NOT NULL DEFAULT 0,
  "failed" INTEGER NOT NULL DEFAULT 0,
  "metrics" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "error_message" TEXT,
  "initiated_by_user_id" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completed_at" TIMESTAMPTZ,
  CONSTRAINT "crm_automation_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "crm_automation_runs_origin_check" CHECK ("origin" IN ('MANUAL','SCHEDULER')),
  CONSTRAINT "crm_automation_runs_operation_check" CHECK ("operation" IN ('EVENT_PROCESSOR','STALE_SWEEP')),
  CONSTRAINT "crm_automation_runs_status_check" CHECK ("status" IN ('SUCCEEDED','FAILED')),
  CONSTRAINT "crm_automation_runs_counts_check" CHECK (
    "scanned" >= 0 AND "created" >= 0 AND "skipped" >= 0 AND "failed" >= 0
  ),
  CONSTRAINT "crm_automation_runs_metrics_object_check" CHECK (jsonb_typeof("metrics") = 'object'),
  CONSTRAINT "crm_automation_runs_completion_check" CHECK ("completed_at" IS NOT NULL)
);

CREATE INDEX "crm_automation_runs_scope_time_idx"
  ON "crm_automation_runs"("tenant_id","company_id","branch_id","started_at" DESC);
CREATE INDEX "crm_automation_runs_operation_time_idx"
  ON "crm_automation_runs"("tenant_id","company_id","branch_id","operation","started_at" DESC);
CREATE INDEX "crm_automation_runs_status_time_idx"
  ON "crm_automation_runs"("tenant_id","company_id","branch_id","status","started_at" DESC);

CREATE OR REPLACE FUNCTION validate_crm_automation_run_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "companies" c
    WHERE c."id" = NEW."company_id" AND c."tenantId" = NEW."tenant_id"
  ) OR NOT EXISTS (
    SELECT 1 FROM "branches" b
    WHERE b."id" = NEW."branch_id" AND b."companyId" = NEW."company_id"
  ) THEN
    RAISE EXCEPTION 'crm automation run organization scope mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "crm_automation_runs_scope_guard"
BEFORE INSERT ON "crm_automation_runs"
FOR EACH ROW EXECUTE FUNCTION validate_crm_automation_run_scope();

COMMIT;
