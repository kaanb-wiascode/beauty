CREATE TABLE "supplier_platform_audit_logs" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "supplier_organization_id" TEXT REFERENCES "supplier_organizations"("id") ON DELETE SET NULL,
  "actor_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "action" TEXT NOT NULL,
  "changed_fields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "supplier_platform_audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_platform_audit_logs_action_check" CHECK (
    "action" IN ('CREATE','UPDATE')
  )
);

CREATE INDEX "supplier_platform_audit_logs_org_idx"
  ON "supplier_platform_audit_logs"("supplier_organization_id", "created_at" DESC);

CREATE INDEX "supplier_platform_audit_logs_actor_idx"
  ON "supplier_platform_audit_logs"("actor_user_id", "created_at" DESC);
