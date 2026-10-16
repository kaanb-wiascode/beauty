CREATE TABLE IF NOT EXISTS "report_schedule_runs" (
  "id" TEXT PRIMARY KEY,
  "schedule_id" TEXT NOT NULL REFERENCES "report_schedules"("id") ON DELETE CASCADE,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "owner_id" TEXT NOT NULL,
  "scheduled_for" TIMESTAMPTZ NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CLAIMED',
  "export_job_id" TEXT REFERENCES "report_export_jobs"("id") ON DELETE SET NULL,
  "error_code" TEXT,
  "error_summary" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "report_schedule_runs_status_check"
    CHECK ("status" IN ('CLAIMED','QUEUED','FAILED')),
  CONSTRAINT "report_schedule_runs_error_summary_length_check"
    CHECK ("error_summary" IS NULL OR length("error_summary") <= 500),
  CONSTRAINT "report_schedule_runs_schedule_window_key"
    UNIQUE ("schedule_id", "scheduled_for")
);

CREATE INDEX IF NOT EXISTS "report_schedule_runs_owner_history_idx"
  ON "report_schedule_runs" ("tenant_id", "company_id", "owner_id", "created_at" DESC);

ALTER TABLE "report_export_jobs"
  ADD COLUMN IF NOT EXISTS "schedule_run_id" TEXT REFERENCES "report_schedule_runs"("id") ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "report_export_jobs_schedule_run_key"
  ON "report_export_jobs" ("schedule_run_id");
