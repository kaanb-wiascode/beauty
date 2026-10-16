CREATE TABLE "platform_provisioning_runs" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "idempotency_key" TEXT NOT NULL,
  "request_fingerprint" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "source_type" TEXT NOT NULL DEFAULT 'MANUAL',
  "source_id" TEXT,
  "tenant_id" TEXT,
  "plan_version_id" TEXT NOT NULL,
  "input" JSONB NOT NULL,
  "last_error" TEXT,
  "created_by_user_id" TEXT NOT NULL,
  "correlation_id" TEXT,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_provisioning_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_provisioning_runs_idempotency_key_key" UNIQUE ("idempotency_key"),
  CONSTRAINT "platform_provisioning_runs_status_check" CHECK ("status" IN ('PENDING','RUNNING','FAILED','COMPLETED')),
  CONSTRAINT "platform_provisioning_runs_source_type_check" CHECK ("source_type" IN ('MANUAL','OPPORTUNITY')),
  CONSTRAINT "platform_provisioning_runs_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "platform_provisioning_runs_plan_version_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "platform_plan_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "platform_provisioning_steps" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "run_id" TEXT NOT NULL,
  "step_key" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "output" JSONB,
  "last_error" TEXT,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_provisioning_steps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_provisioning_steps_run_step_key" UNIQUE ("run_id", "step_key"),
  CONSTRAINT "platform_provisioning_steps_status_check" CHECK ("status" IN ('PENDING','RUNNING','FAILED','COMPLETED','SKIPPED')),
  CONSTRAINT "platform_provisioning_steps_attempt_count_check" CHECK ("attempt_count" >= 0),
  CONSTRAINT "platform_provisioning_steps_run_fkey" FOREIGN KEY ("run_id") REFERENCES "platform_provisioning_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "platform_provisioning_runs_status_created_idx"
  ON "platform_provisioning_runs" ("status", "created_at" DESC);
CREATE INDEX "platform_provisioning_runs_tenant_idx"
  ON "platform_provisioning_runs" ("tenant_id", "created_at" DESC);
CREATE INDEX "platform_provisioning_steps_run_position_idx"
  ON "platform_provisioning_steps" ("run_id", "position");

INSERT INTO "platform_permissions" ("resource", "action", "description") VALUES
  ('provisioning', 'read', 'Read tenant provisioning runs and step state'),
  ('provisioning', 'manage', 'Start and resume tenant provisioning orchestration')
ON CONFLICT ("resource", "action") DO NOTHING;

INSERT INTO "platform_role_permissions" ("role_slug", "resource", "action") VALUES
  ('PLATFORM_OWNER', 'provisioning', 'read'),
  ('PLATFORM_OWNER', 'provisioning', 'manage'),
  ('PLATFORM_ADMIN', 'provisioning', 'read'),
  ('PLATFORM_ADMIN', 'provisioning', 'manage'),
  ('PLATFORM_AUDITOR', 'provisioning', 'read')
ON CONFLICT ("role_slug", "resource", "action") DO NOTHING;
