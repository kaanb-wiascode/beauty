CREATE TABLE "platform_roles" (
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "system" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_roles_pkey" PRIMARY KEY ("slug")
);

CREATE TABLE "platform_permissions" (
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_permissions_pkey" PRIMARY KEY ("resource", "action")
);

CREATE TABLE "platform_admin_user_roles" (
    "user_id" TEXT NOT NULL,
    "role_slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_admin_user_roles_pkey" PRIMARY KEY ("user_id", "role_slug")
);

CREATE TABLE "platform_role_permissions" (
    "role_slug" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_role_permissions_pkey" PRIMARY KEY ("role_slug", "resource", "action")
);

ALTER TABLE "platform_admin_user_roles"
  ADD CONSTRAINT "platform_admin_user_roles_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "platform_admin_users"("user_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_admin_user_roles"
  ADD CONSTRAINT "platform_admin_user_roles_role_slug_fkey"
  FOREIGN KEY ("role_slug") REFERENCES "platform_roles"("slug")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_role_permissions"
  ADD CONSTRAINT "platform_role_permissions_role_slug_fkey"
  FOREIGN KEY ("role_slug") REFERENCES "platform_roles"("slug")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_role_permissions"
  ADD CONSTRAINT "platform_role_permissions_permission_fkey"
  FOREIGN KEY ("resource", "action") REFERENCES "platform_permissions"("resource", "action")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "platform_admin_user_roles_role_slug_idx"
  ON "platform_admin_user_roles"("role_slug");

CREATE INDEX "platform_role_permissions_permission_idx"
  ON "platform_role_permissions"("resource", "action");

INSERT INTO "platform_roles" ("slug", "name", "description") VALUES
  ('PLATFORM_OWNER', 'Platform Owner', 'Full platform-owner authority subject to privileged-action controls.'),
  ('PLATFORM_ADMIN', 'Platform Admin', 'Day-to-day platform administration authority.'),
  ('PLATFORM_AUDITOR', 'Platform Auditor', 'Read-only platform audit and control visibility.');

INSERT INTO "platform_permissions" ("resource", "action", "description") VALUES
  ('command_center', 'read', 'View platform command-center summaries.'),
  ('customers', 'read', 'View platform customer and tenant summaries.'),
  ('platform_iam', 'read', 'View platform users, roles and permissions.'),
  ('platform_iam', 'manage', 'Manage platform users, roles and permission assignments.'),
  ('platform_audit', 'read', 'View platform audit records.');

INSERT INTO "platform_role_permissions" ("role_slug", "resource", "action")
SELECT role_slug, resource, action
FROM (
  VALUES
    ('PLATFORM_OWNER', 'command_center', 'read'),
    ('PLATFORM_OWNER', 'customers', 'read'),
    ('PLATFORM_OWNER', 'platform_iam', 'read'),
    ('PLATFORM_OWNER', 'platform_iam', 'manage'),
    ('PLATFORM_OWNER', 'platform_audit', 'read'),
    ('PLATFORM_ADMIN', 'command_center', 'read'),
    ('PLATFORM_ADMIN', 'customers', 'read'),
    ('PLATFORM_ADMIN', 'platform_iam', 'read'),
    ('PLATFORM_ADMIN', 'platform_audit', 'read'),
    ('PLATFORM_AUDITOR', 'command_center', 'read'),
    ('PLATFORM_AUDITOR', 'platform_audit', 'read')
) AS seeded(role_slug, resource, action);

-- Existing platform administrators are intentionally NOT assigned a role here.
-- Role assignment remains an explicit privileged operator action so no tenant or
-- legacy identity silently acquires new platform authority.
