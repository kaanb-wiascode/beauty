-- Provider-owned entitlement catalog, plan values and tenant overrides.
CREATE TABLE "platform_entitlements" (
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "value_type" TEXT NOT NULL,
  "default_value" JSONB NOT NULL DEFAULT 'null'::jsonb,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_entitlements_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "platform_entitlements_value_type_check" CHECK ("value_type" IN ('BOOLEAN','INTEGER','STRING','JSON')),
  CONSTRAINT "platform_entitlements_status_check" CHECK ("status" IN ('ACTIVE','ARCHIVED'))
);

CREATE TABLE "platform_plan_entitlements" (
  "plan_version_id" TEXT NOT NULL,
  "entitlement_key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_plan_entitlements_pkey" PRIMARY KEY ("plan_version_id", "entitlement_key"),
  CONSTRAINT "platform_plan_entitlements_version_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "platform_plan_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "platform_plan_entitlements_entitlement_fkey" FOREIGN KEY ("entitlement_key") REFERENCES "platform_entitlements"("key") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "platform_tenant_entitlement_overrides" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "entitlement_key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ends_at" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_tenant_entitlement_overrides_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_tenant_entitlement_overrides_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "platform_tenant_entitlement_overrides_entitlement_fkey" FOREIGN KEY ("entitlement_key") REFERENCES "platform_entitlements"("key") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "platform_tenant_entitlement_overrides_status_check" CHECK ("status" IN ('ACTIVE','REVOKED')),
  CONSTRAINT "platform_tenant_entitlement_overrides_window_check" CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at")
);

CREATE INDEX "platform_plan_entitlements_key_idx" ON "platform_plan_entitlements" ("entitlement_key");
CREATE INDEX "platform_tenant_entitlement_overrides_lookup_idx"
  ON "platform_tenant_entitlement_overrides" ("tenant_id", "entitlement_key", "status", "starts_at" DESC);
CREATE INDEX "platform_tenant_entitlement_overrides_expiry_idx"
  ON "platform_tenant_entitlement_overrides" ("ends_at") WHERE "status" = 'ACTIVE' AND "ends_at" IS NOT NULL;

INSERT INTO "platform_permissions" ("resource", "action", "description") VALUES
  ('entitlements', 'read', 'Read platform entitlement catalog and effective tenant entitlements'),
  ('entitlements', 'manage', 'Manage platform entitlement catalog, plan values and tenant overrides')
ON CONFLICT ("resource", "action") DO NOTHING;

INSERT INTO "platform_role_permissions" ("role_slug", "resource", "action") VALUES
  ('PLATFORM_OWNER', 'entitlements', 'read'),
  ('PLATFORM_OWNER', 'entitlements', 'manage'),
  ('PLATFORM_ADMIN', 'entitlements', 'read'),
  ('PLATFORM_AUDITOR', 'entitlements', 'read')
ON CONFLICT ("role_slug", "resource", "action") DO NOTHING;

-- Seed the first common commercial controls without hard-coding product behavior into the plan model.
INSERT INTO "platform_entitlements" ("key", "name", "description", "value_type", "default_value") VALUES
  ('crm.enabled', 'CRM', 'Tenant may use CRM capabilities', 'BOOLEAN', 'false'::jsonb),
  ('finance.enabled', 'Finance', 'Tenant may use finance capabilities', 'BOOLEAN', 'false'::jsonb),
  ('hr.enabled', 'HR', 'Tenant may use human resources capabilities', 'BOOLEAN', 'false'::jsonb),
  ('marketing.enabled', 'Marketing', 'Tenant may use marketing capabilities', 'BOOLEAN', 'false'::jsonb),
  ('reporting.advanced.enabled', 'Advanced Reporting', 'Tenant may use advanced reporting capabilities', 'BOOLEAN', 'false'::jsonb),
  ('api.enabled', 'API Access', 'Tenant may use public/integration API capabilities', 'BOOLEAN', 'false'::jsonb),
  ('ai.monthly_credits', 'AI Monthly Credits', 'Monthly AI credit allowance', 'INTEGER', '0'::jsonb),
  ('branches.limit', 'Branch Limit', 'Maximum entitled branch count', 'INTEGER', '1'::jsonb),
  ('users.limit', 'User Limit', 'Maximum entitled active user count', 'INTEGER', '10'::jsonb)
ON CONFLICT ("key") DO NOTHING;
