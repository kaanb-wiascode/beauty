CREATE TYPE "ServiceExecutionStatus" AS ENUM (
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED'
);

CREATE TABLE "operations_service_executions" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "visit_id" TEXT NOT NULL,
  "appointment_id" TEXT NOT NULL,
  "service_id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "room_id" TEXT,
  "inventory_asset_id" TEXT,
  "status" "ServiceExecutionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ,
  "cancelled_at" TIMESTAMPTZ,
  "note" TEXT,
  "completion_note" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by_membership_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "operations_service_executions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operations_service_executions_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_service_executions_company_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_service_executions_branch_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_service_executions_visit_fkey"
    FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_service_executions_appointment_fkey"
    FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_service_executions_service_fkey"
    FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_service_executions_staff_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_service_executions_room_fkey"
    FOREIGN KEY ("room_id") REFERENCES "operations_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "operations_service_executions_asset_fkey"
    FOREIGN KEY ("inventory_asset_id") REFERENCES "inventory_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "operations_service_executions_membership_fkey"
    FOREIGN KEY ("created_by_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "operations_service_executions_active_appointment_key"
  ON "operations_service_executions"("appointment_id")
  WHERE "status" <> 'CANCELLED'::"ServiceExecutionStatus";
CREATE INDEX "operations_service_executions_visit_created_idx"
  ON "operations_service_executions"("visit_id", "created_at");
CREATE INDEX "operations_service_executions_branch_status_idx"
  ON "operations_service_executions"("tenant_id", "branch_id", "status");
CREATE INDEX "operations_service_executions_staff_started_idx"
  ON "operations_service_executions"("staff_id", "started_at");

CREATE TABLE "operations_service_execution_events" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "execution_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "actor_membership_id" TEXT NOT NULL,
  "event_type" VARCHAR(64) NOT NULL,
  "from_status" "ServiceExecutionStatus",
  "to_status" "ServiceExecutionStatus" NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "operations_service_execution_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operations_service_execution_events_execution_fkey"
    FOREIGN KEY ("execution_id") REFERENCES "operations_service_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_service_execution_events_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_service_execution_events_branch_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_service_execution_events_membership_fkey"
    FOREIGN KEY ("actor_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "operations_service_execution_events_execution_created_idx"
  ON "operations_service_execution_events"("execution_id", "created_at");
