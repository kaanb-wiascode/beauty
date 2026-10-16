-- Platform control-plane lifecycle state for tenant accounts.
-- This state is deliberately separate from tenant-owned business configuration.
CREATE TABLE "platform_tenant_lifecycle" (
    "tenant_id" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT,
    "updated_by_user_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_tenant_lifecycle_pkey" PRIMARY KEY ("tenant_id"),
    CONSTRAINT "platform_tenant_lifecycle_state_check"
        CHECK ("state" IN ('ACTIVE', 'RESTRICTED', 'SUSPENDED')),
    CONSTRAINT "platform_tenant_lifecycle_version_check"
        CHECK ("version" > 0),
    CONSTRAINT "platform_tenant_lifecycle_tenant_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "platform_tenant_lifecycle_state_updated_at_idx"
    ON "platform_tenant_lifecycle" ("state", "updated_at" DESC);

-- Existing tenants remain active unless the platform explicitly places a lifecycle control on them.
INSERT INTO "platform_tenant_lifecycle" ("tenant_id", "state")
SELECT "id", 'ACTIVE'
FROM "tenants"
ON CONFLICT ("tenant_id") DO NOTHING;

-- Customer lifecycle mutation is provider authority and must never be inferred from tenant roles.
INSERT INTO "platform_permissions" ("resource", "action", "description")
VALUES ('customers', 'manage', 'Manage platform customer lifecycle state')
ON CONFLICT ("resource", "action") DO NOTHING;

INSERT INTO "platform_role_permissions" ("role_slug", "resource", "action")
SELECT role_slug, 'customers', 'manage'
FROM (VALUES ('PLATFORM_OWNER'), ('PLATFORM_ADMIN')) AS roles(role_slug)
WHERE EXISTS (
    SELECT 1 FROM "platform_roles" pr WHERE pr."slug" = roles.role_slug
)
ON CONFLICT ("role_slug", "resource", "action") DO NOTHING;
