CREATE TABLE "platform_roles" (
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "system" BOOLEAN NOT NULL DEFAULT false,
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

CREATE TABLE "platform_role_permissions" (
    "role_slug" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_role_permissions_pkey"
      PRIMARY KEY ("role_slug", "resource", "action"),
    CONSTRAINT "platform_role_permissions_role_slug_fkey"
      FOREIGN KEY ("role_slug") REFERENCES "platform_roles"("slug")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "platform_role_permissions_permission_fkey"
      FOREIGN KEY ("resource", "action")
      REFERENCES "platform_permissions"("resource", "action")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "platform_admin_user_roles" (
    "user_id" TEXT NOT NULL,
    "role_slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_admin_user_roles_pkey"
      PRIMARY KEY ("user_id", "role_slug"),
    CONSTRAINT "platform_admin_user_roles_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "platform_admin_users"("user_id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "platform_admin_user_roles_role_slug_fkey"
      FOREIGN KEY ("role_slug") REFERENCES "platform_roles"("slug")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "platform_role_permissions_permission_idx"
  ON "platform_role_permissions"("resource", "action");
CREATE INDEX "platform_admin_user_roles_role_slug_idx"
  ON "platform_admin_user_roles"("role_slug");

INSERT INTO "platform_roles" ("slug", "name", "description", "system")
VALUES
  ('PLATFORM_OWNER', 'Platform Owner', 'Full platform governance authority', true),
  ('PLATFORM_ADMIN', 'Platform Admin', 'Operational platform administration', true),
  ('PLATFORM_AUDITOR', 'Platform Auditor', 'Read-only platform audit authority', true)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "platform_permissions" ("resource", "action", "description")
VALUES
  ('command_center', 'read', 'View platform command center'),
  ('customers', 'read', 'View platform customer and tenant records'),
  ('platform_iam', 'read', 'View platform administrators, roles and permissions'),
  ('platform_iam', 'manage', 'Manage platform administrators, roles and permissions'),
  ('platform_audit', 'read', 'View platform audit events')
ON CONFLICT ("resource", "action") DO NOTHING;

INSERT INTO "platform_role_permissions" ("role_slug", "resource", "action")
VALUES
  ('PLATFORM_OWNER', 'command_center', 'read'),
  ('PLATFORM_OWNER', 'customers', 'read'),
  ('PLATFORM_OWNER', 'platform_iam', 'read'),
  ('PLATFORM_OWNER', 'platform_iam', 'manage'),
  ('PLATFORM_OWNER', 'platform_audit', 'read'),
  ('PLATFORM_ADMIN', 'command_center', 'read'),
  ('PLATFORM_ADMIN', 'customers', 'read'),
  ('PLATFORM_ADMIN', 'platform_iam', 'read'),
  ('PLATFORM_AUDITOR', 'command_center', 'read'),
  ('PLATFORM_AUDITOR', 'platform_audit', 'read')
ON CONFLICT ("role_slug", "resource", "action") DO NOTHING;
