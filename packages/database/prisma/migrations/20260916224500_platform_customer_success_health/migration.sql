ALTER TABLE "platform_customer_accounts"
  ADD COLUMN "segment" TEXT NOT NULL DEFAULT 'SMB',
  ADD COLUMN "success_stage" TEXT NOT NULL DEFAULT 'ONBOARDING',
  ADD COLUMN "risk_status" TEXT NOT NULL DEFAULT 'LOW',
  ADD COLUMN "risk_reason" TEXT,
  ADD COLUMN "next_review_at" TIMESTAMP(3),
  ADD CONSTRAINT "platform_customer_accounts_segment_check"
    CHECK ("segment" IN ('SMB','MID_MARKET','ENTERPRISE','STRATEGIC')),
  ADD CONSTRAINT "platform_customer_accounts_success_stage_check"
    CHECK ("success_stage" IN ('ONBOARDING','ADOPTION','GROWTH','RENEWAL','AT_RISK','OFFBOARDING')),
  ADD CONSTRAINT "platform_customer_accounts_risk_status_check"
    CHECK ("risk_status" IN ('LOW','MEDIUM','HIGH','CRITICAL'));

INSERT INTO "platform_customer_accounts" ("tenant_id")
SELECT t."id"
FROM "tenants" t
ON CONFLICT ("tenant_id") DO NOTHING;

CREATE OR REPLACE FUNCTION platform_ensure_customer_account_on_tenant_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO "platform_customer_accounts" ("tenant_id")
  VALUES (NEW."id")
  ON CONFLICT ("tenant_id") DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_ensure_customer_account_on_tenant_insert_trigger ON "tenants";
CREATE TRIGGER platform_ensure_customer_account_on_tenant_insert_trigger
AFTER INSERT ON "tenants"
FOR EACH ROW
EXECUTE FUNCTION platform_ensure_customer_account_on_tenant_insert();

CREATE INDEX "platform_customer_accounts_success_portfolio_idx"
  ON "platform_customer_accounts" ("success_stage", "risk_status", "next_review_at");
CREATE INDEX "platform_customer_accounts_segment_idx"
  ON "platform_customer_accounts" ("segment", "updated_at" DESC);

CREATE TABLE "platform_customer_success_events" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'INFO',
  "summary" TEXT NOT NULL,
  "details" JSONB,
  "created_by_platform_user_id" TEXT NOT NULL,
  "happened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_customer_success_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_customer_success_events_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "platform_customer_success_events_actor_fkey"
    FOREIGN KEY ("created_by_platform_user_id") REFERENCES "platform_admin_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "platform_customer_success_events_type_check"
    CHECK (char_length(trim("event_type")) BETWEEN 1 AND 80),
  CONSTRAINT "platform_customer_success_events_severity_check"
    CHECK ("severity" IN ('INFO','WATCH','RISK','CRITICAL')),
  CONSTRAINT "platform_customer_success_events_summary_check"
    CHECK (char_length(trim("summary")) BETWEEN 1 AND 1000)
);

CREATE INDEX "platform_customer_success_events_tenant_timeline_idx"
  ON "platform_customer_success_events" ("tenant_id", "happened_at" DESC, "id" DESC);
CREATE INDEX "platform_customer_success_events_severity_idx"
  ON "platform_customer_success_events" ("severity", "happened_at" DESC);

CREATE TABLE "platform_tenant_health_snapshots" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "total_score" INTEGER NOT NULL,
  "lifecycle_score" INTEGER NOT NULL,
  "subscription_score" INTEGER NOT NULL,
  "provisioning_score" INTEGER NOT NULL,
  "owner_access_score" INTEGER NOT NULL,
  "onboarding_score" INTEGER NOT NULL,
  "risk_band" TEXT NOT NULL,
  "reasons" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "calculated_by_platform_user_id" TEXT NOT NULL,
  "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_tenant_health_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_tenant_health_snapshots_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "platform_tenant_health_snapshots_actor_fkey"
    FOREIGN KEY ("calculated_by_platform_user_id") REFERENCES "platform_admin_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "platform_tenant_health_snapshots_total_check" CHECK ("total_score" BETWEEN 0 AND 100),
  CONSTRAINT "platform_tenant_health_snapshots_lifecycle_check" CHECK ("lifecycle_score" BETWEEN 0 AND 20),
  CONSTRAINT "platform_tenant_health_snapshots_subscription_check" CHECK ("subscription_score" BETWEEN 0 AND 20),
  CONSTRAINT "platform_tenant_health_snapshots_provisioning_check" CHECK ("provisioning_score" BETWEEN 0 AND 20),
  CONSTRAINT "platform_tenant_health_snapshots_owner_access_check" CHECK ("owner_access_score" BETWEEN 0 AND 20),
  CONSTRAINT "platform_tenant_health_snapshots_onboarding_check" CHECK ("onboarding_score" BETWEEN 0 AND 20),
  CONSTRAINT "platform_tenant_health_snapshots_risk_band_check"
    CHECK ("risk_band" IN ('HEALTHY','WATCH','AT_RISK','CRITICAL'))
);

CREATE INDEX "platform_tenant_health_snapshots_tenant_latest_idx"
  ON "platform_tenant_health_snapshots" ("tenant_id", "calculated_at" DESC, "id" DESC);
CREATE INDEX "platform_tenant_health_snapshots_risk_idx"
  ON "platform_tenant_health_snapshots" ("risk_band", "calculated_at" DESC);

INSERT INTO "platform_permissions" ("resource", "action", "description") VALUES
  ('customer_success', 'read', 'Read platform customer success portfolio and timeline'),
  ('customer_success', 'manage', 'Manage platform customer success portfolio and timeline'),
  ('tenant_health', 'read', 'Read tenant health snapshots and risk signals'),
  ('tenant_health', 'recalculate', 'Recalculate deterministic tenant health snapshots')
ON CONFLICT ("resource", "action") DO NOTHING;

INSERT INTO "platform_role_permissions" ("role_slug", "resource", "action") VALUES
  ('PLATFORM_OWNER', 'customer_success', 'read'),
  ('PLATFORM_OWNER', 'customer_success', 'manage'),
  ('PLATFORM_OWNER', 'tenant_health', 'read'),
  ('PLATFORM_OWNER', 'tenant_health', 'recalculate'),
  ('PLATFORM_ADMIN', 'customer_success', 'read'),
  ('PLATFORM_ADMIN', 'customer_success', 'manage'),
  ('PLATFORM_ADMIN', 'tenant_health', 'read'),
  ('PLATFORM_ADMIN', 'tenant_health', 'recalculate'),
  ('PLATFORM_AUDITOR', 'customer_success', 'read'),
  ('PLATFORM_AUDITOR', 'tenant_health', 'read')
ON CONFLICT ("role_slug", "resource", "action") DO NOTHING;
