CREATE TABLE "supplier_memberships" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "supplier_organization_id" TEXT NOT NULL REFERENCES "supplier_organizations"("id") ON DELETE CASCADE,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL DEFAULT 'MEMBER',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "invited_by_user_id" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "joined_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "supplier_memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_memberships_org_user_key" UNIQUE ("supplier_organization_id", "user_id"),
  CONSTRAINT "supplier_memberships_role_check" CHECK ("role" IN ('OWNER','ADMIN','MEMBER')),
  CONSTRAINT "supplier_memberships_status_check" CHECK ("status" IN ('INVITED','ACTIVE','SUSPENDED','REVOKED'))
);

CREATE INDEX "supplier_memberships_org_status_idx"
  ON "supplier_memberships"("supplier_organization_id", "status");

CREATE INDEX "supplier_memberships_user_status_idx"
  ON "supplier_memberships"("user_id", "status");

CREATE TABLE "supplier_membership_audit_logs" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "supplier_membership_id" TEXT REFERENCES "supplier_memberships"("id") ON DELETE SET NULL,
  "supplier_organization_id" TEXT NOT NULL REFERENCES "supplier_organizations"("id") ON DELETE RESTRICT,
  "actor_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "target_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "action" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "supplier_membership_audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_membership_audit_action_check" CHECK ("action" IN ('UPSERT','ROLE_CHANGE','STATUS_CHANGE')),
  CONSTRAINT "supplier_membership_audit_role_check" CHECK ("role" IN ('OWNER','ADMIN','MEMBER')),
  CONSTRAINT "supplier_membership_audit_status_check" CHECK ("status" IN ('INVITED','ACTIVE','SUSPENDED','REVOKED'))
);

CREATE INDEX "supplier_membership_audit_org_created_idx"
  ON "supplier_membership_audit_logs"("supplier_organization_id", "created_at" DESC);
