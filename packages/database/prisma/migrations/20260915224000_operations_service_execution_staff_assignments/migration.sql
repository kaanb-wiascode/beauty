CREATE TYPE "ServiceExecutionStaffRole" AS ENUM ('PRIMARY','ASSISTANT','HANDOFF');

CREATE TABLE "operations_service_execution_staff_assignments" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "execution_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "role" "ServiceExecutionStaffRole" NOT NULL,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMPTZ,
  "note" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by_membership_id" TEXT NOT NULL,
  "ended_by_membership_id" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operations_service_execution_staff_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operations_service_execution_staff_assignments_execution_fkey" FOREIGN KEY ("execution_id") REFERENCES "operations_service_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_service_execution_staff_assignments_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_service_execution_staff_assignments_company_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_service_execution_staff_assignments_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_service_execution_staff_assignments_staff_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_service_execution_staff_assignments_created_by_fkey" FOREIGN KEY ("created_by_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_service_execution_staff_assignments_ended_by_fkey" FOREIGN KEY ("ended_by_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "operations_service_execution_staff_assignments_interval_check" CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at")
);

CREATE UNIQUE INDEX "operations_service_execution_staff_active_key"
  ON "operations_service_execution_staff_assignments"("execution_id","staff_id")
  WHERE "ended_at" IS NULL;
CREATE INDEX "operations_service_execution_staff_execution_idx"
  ON "operations_service_execution_staff_assignments"("execution_id","started_at");
CREATE INDEX "operations_service_execution_staff_staff_idx"
  ON "operations_service_execution_staff_assignments"("tenant_id","branch_id","staff_id","started_at");

INSERT INTO "operations_service_execution_staff_assignments"(
  execution_id,tenant_id,company_id,branch_id,staff_id,role,started_at,note,created_by_membership_id
)
SELECT id,tenant_id,company_id,branch_id,staff_id,'PRIMARY'::"ServiceExecutionStaffRole",started_at,'Backfilled primary staff assignment',created_by_membership_id
FROM operations_service_executions;
