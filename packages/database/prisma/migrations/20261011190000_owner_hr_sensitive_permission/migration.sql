-- Existing HR controllers require hr_sensitive.read for payroll and identity data.
-- Keep the established hr/read, hr/manage, inventory/read and inventory/write vocabulary.
INSERT INTO "permissions" ("id", "resource", "action", "description", "createdAt")
SELECT gen_random_uuid()::text, 'hr_sensitive', 'read', 'Read sensitive HR and payroll data', CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "permissions"
  WHERE "resource" = 'hr_sensitive' AND "action" = 'read'
);

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."slug" = 'owner'
  AND p."resource" = 'hr_sensitive'
  AND p."action" = 'read'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
