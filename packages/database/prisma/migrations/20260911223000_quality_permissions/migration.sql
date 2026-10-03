BEGIN;

INSERT INTO "permissions" ("id", "resource", "action", "description", "createdAt")
VALUES
  (gen_random_uuid()::text, 'quality', 'read', 'quality read permission', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'quality', 'manage', 'quality manage permission', CURRENT_TIMESTAMP)
ON CONFLICT ("resource", "action") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p
  ON p."resource" = 'quality'
 AND p."action" IN ('read', 'manage')
WHERE r."slug" = 'owner'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

COMMIT;
