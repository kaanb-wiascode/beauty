-- Idempotent granular permission creation and legacy grant backfill.
INSERT INTO "permissions" ("id", "resource", "action", "description", "createdAt")
SELECT gen_random_uuid()::text, v.resource, v.action, v.resource || ' ' || v.action, now()
FROM (VALUES
 ('inventory','create'),('inventory','update'),('inventory','delete'),
 ('hr','create'),('hr','update'),('hr','delete'),
 ('hr_payroll','read'),('hr_payroll','create'),('hr_payroll','update')
) AS v(resource,action)
ON CONFLICT ("resource","action") DO NOTHING;

INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT DISTINCT rp."roleId", new_permission."id"
FROM "role_permissions" rp
JOIN "permissions" old_permission ON old_permission."id" = rp."permissionId"
JOIN "permissions" new_permission ON
 (old_permission."resource"='inventory' AND old_permission."action"='write'
  AND new_permission."resource"='inventory' AND new_permission."action" IN ('create','update','delete'))
 OR
 (old_permission."resource"='hr' AND old_permission."action"='manage'
  AND new_permission."resource"='hr' AND new_permission."action" IN ('create','update','delete'))
ON CONFLICT ("roleId","permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT DISTINCT sensitive."roleId", new_permission."id"
FROM "role_permissions" sensitive
JOIN "permissions" sensitive_permission ON sensitive_permission."id"=sensitive."permissionId"
JOIN "role_permissions" existing ON existing."roleId"=sensitive."roleId"
JOIN "permissions" old_permission ON old_permission."id"=existing."permissionId"
JOIN "permissions" new_permission ON new_permission."resource"='hr_payroll'
WHERE sensitive_permission."resource"='hr_sensitive'
 AND sensitive_permission."action"='read'
 AND old_permission."resource"='hr'
 AND ((new_permission."action"='read' AND old_permission."action"='read')
  OR (new_permission."action" IN ('create','update') AND old_permission."action"='manage'))
ON CONFLICT ("roleId","permissionId") DO NOTHING;
