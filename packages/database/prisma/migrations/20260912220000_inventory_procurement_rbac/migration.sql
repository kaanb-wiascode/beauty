BEGIN;

INSERT INTO "permissions" ("id", "resource", "action", "description", "createdAt")
VALUES
  (gen_random_uuid()::text, 'inventory', 'read', 'inventory and procurement read permission', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'inventory', 'write', 'inventory and procurement write permission', CURRENT_TIMESTAMP)
ON CONFLICT ("resource", "action") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."resource"='inventory' AND p."action" IN ('read','write')
WHERE r."slug"='owner'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

COMMIT;
