CREATE TABLE "financial_health_daily_job_runs" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "run_date" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'STARTED',
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completed_at" TIMESTAMPTZ,
  "failed_at" TIMESTAMPTZ,
  "error_message" TEXT,
  "company_count" INTEGER NOT NULL DEFAULT 0,
  "branch_count" INTEGER NOT NULL DEFAULT 0,
  "snapshot_count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "financial_health_daily_job_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "financial_health_daily_job_runs_status_check" CHECK ("status" IN ('STARTED','COMPLETED','FAILED')),
  CONSTRAINT "financial_health_daily_job_runs_run_date_key" UNIQUE ("run_date")
);

CREATE INDEX "financial_health_daily_job_runs_status_idx"
  ON "financial_health_daily_job_runs"("status", "run_date");
