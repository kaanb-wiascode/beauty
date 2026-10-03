CREATE TABLE "platform_tenant_onboarding" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "provisioning_run_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  "owner_user_id" TEXT,
  "started_at" TIMESTAMP(3),
  "target_go_live_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_tenant_onboarding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_tenant_onboarding_tenant_key" UNIQUE ("tenant_id"),
  CONSTRAINT "platform_tenant_onboarding_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "platform_tenant_onboarding_run_fkey" FOREIGN KEY ("provisioning_run_id") REFERENCES "platform_provisioning_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "platform_tenant_onboarding_status_check" CHECK ("status" IN ('NOT_STARTED','IN_PROGRESS','BLOCKED','READY_FOR_GO_LIVE','COMPLETED'))
);

CREATE TABLE "platform_tenant_onboarding_items" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "onboarding_id" TEXT NOT NULL,
  "item_key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "position" INTEGER NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT TRUE,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "completed_by_user_id" TEXT,
  "completed_at" TIMESTAMP(3),
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_tenant_onboarding_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_tenant_onboarding_items_onboarding_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "platform_tenant_onboarding"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "platform_tenant_onboarding_items_key" UNIQUE ("onboarding_id", "item_key"),
  CONSTRAINT "platform_tenant_onboarding_items_status_check" CHECK ("status" IN ('PENDING','IN_PROGRESS','BLOCKED','COMPLETED','SKIPPED')),
  CONSTRAINT "platform_tenant_onboarding_items_position_check" CHECK ("position" > 0)
);

CREATE INDEX "platform_tenant_onboarding_status_idx"
  ON "platform_tenant_onboarding" ("status", "updated_at" DESC);
CREATE INDEX "platform_tenant_onboarding_items_status_idx"
  ON "platform_tenant_onboarding_items" ("onboarding_id", "status", "position");

INSERT INTO "platform_permissions" ("resource", "action", "description") VALUES
  ('onboarding', 'read', 'Read tenant onboarding state and checklist'),
  ('onboarding', 'manage', 'Manage tenant onboarding state and checklist')
ON CONFLICT ("resource", "action") DO NOTHING;

INSERT INTO "platform_role_permissions" ("role_slug", "resource", "action") VALUES
  ('PLATFORM_OWNER', 'onboarding', 'read'),
  ('PLATFORM_OWNER', 'onboarding', 'manage'),
  ('PLATFORM_ADMIN', 'onboarding', 'read'),
  ('PLATFORM_ADMIN', 'onboarding', 'manage'),
  ('PLATFORM_AUDITOR', 'onboarding', 'read')
ON CONFLICT ("role_slug", "resource", "action") DO NOTHING;
