CREATE TABLE IF NOT EXISTS domain_event_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT,
  actor_membership_id TEXT,
  event_name TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS domain_event_log_scope_idx
  ON domain_event_log (tenant_id, company_id, branch_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS domain_event_log_unpublished_idx
  ON domain_event_log (published_at, occurred_at)
  WHERE published_at IS NULL;

WITH desired(resource, action, description) AS (
  VALUES
    ('operations','read','Operasyon Merkezi kayıtlarını ve canlı akışı görüntüleme'),
    ('operations','manage','Operasyon Merkezi süreçlerini yönetme')
)
INSERT INTO "permissions" ("id","resource","action","description","createdAt")
SELECT gen_random_uuid()::text, resource, action, description, CURRENT_TIMESTAMP
FROM desired
ON CONFLICT ("resource","action")
DO UPDATE SET "description" = EXCLUDED."description";

WITH permission_map(new_resource,new_action,old_resource,old_action) AS (
  VALUES
    ('operations','read','appointments','read'),
    ('operations','manage','appointments','update')
)
INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT DISTINCT rp."roleId", new_permission."id"
FROM permission_map mapping
JOIN "permissions" old_permission
  ON old_permission."resource" = mapping.old_resource
 AND old_permission."action" = mapping.old_action
JOIN "role_permissions" rp
  ON rp."permissionId" = old_permission."id"
JOIN "permissions" new_permission
  ON new_permission."resource" = mapping.new_resource
 AND new_permission."action" = mapping.new_action
ON CONFLICT ("roleId","permissionId") DO NOTHING;
