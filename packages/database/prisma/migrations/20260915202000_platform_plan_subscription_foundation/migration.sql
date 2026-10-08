-- Provider-owned commercial plan catalog and tenant subscriptions.
CREATE TABLE "platform_plans" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_plans_code_key" UNIQUE ("code"),
  CONSTRAINT "platform_plans_status_check" CHECK ("status" IN ('ACTIVE','ARCHIVED'))
);

CREATE TABLE "platform_plan_versions" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "plan_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'TRY',
  "monthly_price" DECIMAL(14,2),
  "annual_price" DECIMAL(14,2),
  "branch_limit" INTEGER,
  "user_limit" INTEGER,
  "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effective_to" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_plan_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_plan_versions_plan_fkey" FOREIGN KEY ("plan_id") REFERENCES "platform_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "platform_plan_versions_plan_version_key" UNIQUE ("plan_id", "version"),
  CONSTRAINT "platform_plan_versions_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','RETIRED')),
  CONSTRAINT "platform_plan_versions_currency_check" CHECK (char_length("currency") = 3),
  CONSTRAINT "platform_plan_versions_branch_limit_check" CHECK ("branch_limit" IS NULL OR "branch_limit" > 0),
  CONSTRAINT "platform_plan_versions_user_limit_check" CHECK ("user_limit" IS NULL OR "user_limit" > 0)
);

CREATE TABLE "platform_tenant_subscriptions" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "plan_version_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "currency" TEXT NOT NULL,
  "contracted_monthly_price" DECIMAL(14,2),
  "contracted_annual_price" DECIMAL(14,2),
  "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "renews_at" TIMESTAMP(3),
  "ends_at" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by_user_id" TEXT,
  "updated_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_tenant_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_tenant_subscriptions_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "platform_tenant_subscriptions_plan_version_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "platform_plan_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "platform_tenant_subscriptions_status_check" CHECK ("status" IN ('TRIAL','ACTIVE','PAST_DUE','CANCELLED','EXPIRED')),
  CONSTRAINT "platform_tenant_subscriptions_currency_check" CHECK (char_length("currency") = 3),
  CONSTRAINT "platform_tenant_subscriptions_discount_check" CHECK ("discount_percent" >= 0 AND "discount_percent" <= 100),
  CONSTRAINT "platform_tenant_subscriptions_version_check" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "platform_tenant_subscriptions_current_tenant_idx"
  ON "platform_tenant_subscriptions" ("tenant_id")
  WHERE "status" IN ('TRIAL','ACTIVE','PAST_DUE');
CREATE INDEX "platform_plan_versions_effective_idx" ON "platform_plan_versions" ("plan_id", "effective_from" DESC);
CREATE INDEX "platform_tenant_subscriptions_tenant_created_idx" ON "platform_tenant_subscriptions" ("tenant_id", "created_at" DESC);

INSERT INTO "platform_permissions" ("resource", "action", "description") VALUES
  ('subscriptions', 'read', 'Read platform plan catalog and tenant subscriptions'),
  ('subscriptions', 'manage', 'Manage platform plan catalog and tenant subscriptions')
ON CONFLICT ("resource", "action") DO NOTHING;

INSERT INTO "platform_role_permissions" ("role_slug", "resource", "action") VALUES
  ('PLATFORM_OWNER', 'subscriptions', 'read'),
  ('PLATFORM_OWNER', 'subscriptions', 'manage'),
  ('PLATFORM_ADMIN', 'subscriptions', 'read'),
  ('PLATFORM_AUDITOR', 'subscriptions', 'read')
ON CONFLICT ("role_slug", "resource", "action") DO NOTHING;