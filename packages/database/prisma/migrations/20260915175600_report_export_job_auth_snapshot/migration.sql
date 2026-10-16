ALTER TABLE "report_export_jobs"
  ADD COLUMN "membership_id" TEXT,
  ADD COLUMN "role_id" TEXT;

UPDATE "report_export_jobs"
SET
  "membership_id" = 'legacy-export-job',
  "role_id" = 'legacy-export-job'
WHERE "membership_id" IS NULL OR "role_id" IS NULL;

ALTER TABLE "report_export_jobs"
  ALTER COLUMN "membership_id" SET NOT NULL,
  ALTER COLUMN "role_id" SET NOT NULL;

CREATE INDEX "report_export_jobs_tenant_membership_idx"
  ON "report_export_jobs" ("tenant_id", "membership_id", "requested_at" DESC);
