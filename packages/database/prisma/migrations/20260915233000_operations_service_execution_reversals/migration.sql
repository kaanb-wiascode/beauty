CREATE TYPE "ServiceExecutionCorrectionAction" AS ENUM ('CANCEL', 'REVERSE_COMPLETION');

CREATE TABLE "operations_service_execution_corrections" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "execution_id" TEXT NOT NULL,
  "action" "ServiceExecutionCorrectionAction" NOT NULL,
  "from_status" "ServiceExecutionStatus" NOT NULL,
  "to_status" "ServiceExecutionStatus" NOT NULL,
  "reason_code" VARCHAR(64) NOT NULL,
  "reason_label" VARCHAR(200) NOT NULL,
  "note" TEXT,
  "execution_version_before" INTEGER NOT NULL,
  "actor_membership_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "operations_service_execution_corrections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operations_service_execution_corrections_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_service_execution_corrections_company_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_service_execution_corrections_branch_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_service_execution_corrections_execution_fkey"
    FOREIGN KEY ("execution_id") REFERENCES "operations_service_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_service_execution_corrections_actor_fkey"
    FOREIGN KEY ("actor_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "operations_service_execution_corrections_execution_created_idx"
  ON "operations_service_execution_corrections"("execution_id", "created_at");
CREATE INDEX "operations_service_execution_corrections_branch_action_idx"
  ON "operations_service_execution_corrections"("tenant_id", "branch_id", "action", "created_at");
