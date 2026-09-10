-- Inventory endpoints are protected by the API permission guard.
-- Keep the permission catalog idempotent and grant all existing owner roles.

INSERT INTO "permissions" ("id", "resource", "action", "description")
VALUES
  (gen_random_uuid()::text, 'inventory', 'read', 'inventory read permission'),
  (gen_random_uuid()::text, 'inventory', 'create', 'inventory create permission'),
  (gen_random_uuid()::text, 'inventory', 'update', 'inventory update permission')
ON CONFLICT ("resource", "action") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."slug" = 'owner'
  AND p."resource" = 'inventory'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
