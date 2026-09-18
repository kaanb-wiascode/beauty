CREATE TABLE "management_finance_action_policies" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "branch_id" TEXT REFERENCES "branches"("id") ON DELETE CASCADE,
  "critical_hours" INTEGER NOT NULL DEFAULT 24 CHECK ("critical_hours" > 0),
  "high_hours" INTEGER NOT NULL DEFAULT 72 CHECK ("high_hours" > 0),
  "medium_hours" INTEGER NOT NULL DEFAULT 168 CHECK ("medium_hours" > 0),
  "low_hours" INTEGER NOT NULL DEFAULT 336 CHECK ("low_hours" > 0),
  "escalation_grace_hours" INTEGER NOT NULL DEFAULT 24 CHECK ("escalation_grace_hours" > 0),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "management_finance_action_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "management_finance_action_policies_scope_unique"
  ON "management_finance_action_policies"("company_id", (COALESCE("branch_id", '')));

ALTER TABLE "management_finance_actions"
  ADD COLUMN "auto_generated" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "escalation_level" INTEGER NOT NULL DEFAULT 0 CHECK ("escalation_level" >= 0),
  ADD COLUMN "last_escalated_at" TIMESTAMPTZ;

CREATE UNIQUE INDEX "management_finance_actions_open_auto_source_unique"
  ON "management_finance_actions"("company_id", (COALESCE("branch_id", '')), "source_type", "source_code")
  WHERE "auto_generated" = TRUE AND "status" IN ('OPEN','IN_PROGRESS','BLOCKED');

CREATE INDEX "management_finance_actions_sla_idx"
  ON "management_finance_actions"("company_id", "status", "due_at", "priority");
