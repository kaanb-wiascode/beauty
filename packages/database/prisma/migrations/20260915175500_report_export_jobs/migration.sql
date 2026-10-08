CREATE TABLE "report_export_jobs" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "role_scope" TEXT NOT NULL,
  "requested_by" TEXT NOT NULL,
  "report_key" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "filters" JSONB NOT NULL,
  "columns" JSONB NOT NULL,
  "sort" JSONB,
  "include_summary" BOOLEAN NOT NULL DEFAULT true,
  "include_charts" BOOLEAN NOT NULL DEFAULT false,
  "row_count" INTEGER,
  "storage_key" TEXT,
  "error_code" TEXT,
  "error_summary" TEXT,
  "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "expires_at" TIMESTAMPTZ,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "report_export_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "report_export_jobs_format_check" CHECK ("format" IN ('PDF', 'XLSX', 'CSV')),
  CONSTRAINT "report_export_jobs_status_check" CHECK ("status" IN ('QUEUED', 'PROCESSING', 'READY', 'FAILED', 'EXPIRED')),
  CONSTRAINT "report_export_jobs_role_scope_check" CHECK ("role_scope" IN ('CENTRAL', 'COMPANY', 'BRANCH')),
  CONSTRAINT "report_export_jobs_row_count_check" CHECK ("row_count" IS NULL OR "row_count" >= 0)
);

CREATE INDEX "report_export_jobs_tenant_requested_at_idx"
  ON "report_export_jobs" ("tenant_id", "requested_at" DESC);

CREATE INDEX "report_export_jobs_tenant_company_requested_at_idx"
  ON "report_export_jobs" ("tenant_id", "company_id", "requested_at" DESC);

CREATE INDEX "report_export_jobs_tenant_branch_requested_at_idx"
  ON "report_export_jobs" ("tenant_id", "branch_id", "requested_at" DESC)
  WHERE "branch_id" IS NOT NULL;

CREATE INDEX "report_export_jobs_tenant_status_idx"
  ON "report_export_jobs" ("tenant_id", "status");

CREATE INDEX "report_export_jobs_tenant_requester_idx"
  ON "report_export_jobs" ("tenant_id", "requested_by", "requested_at" DESC);
