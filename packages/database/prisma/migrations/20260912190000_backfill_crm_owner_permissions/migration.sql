-- Ensure CRM permissions exist for databases created before the CRM module
-- was added to the permission catalog. IDs are deterministic text values only
-- for newly-created rows; existing permission rows are preserved.
INSERT INTO "permissions" ("id", "resource", "action", "description", "createdAt")
VALUES
  ('2c4e61d8-5cd4-4af4-8f68-6df7a8c5c101', 'crm', 'read', 'crm read permission', CURRENT_TIMESTAMP),
  ('2c4e61d8-5cd4-4af4-8f68-6df7a8c5c102', 'crm', 'manage', 'crm manage permission', CURRENT_TIMESTAMP)
ON CONFLICT ("resource", "action") DO NOTHING;

-- Backfill every tenant owner role without changing non-owner role grants.
-- The composite primary key makes this safe to run repeatedly.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."slug" = 'owner'
  AND p."resource" = 'crm'
  AND p."action" IN ('read', 'manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
