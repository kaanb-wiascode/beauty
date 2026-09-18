CREATE TABLE IF NOT EXISTS finance_integration_audit_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT,
  actor_user_id TEXT,
  actor_role_id TEXT,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  entity_id TEXT,
  outcome TEXT NOT NULL,
  route TEXT,
  method TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS finance_integration_audit_logs_scope_created_idx
  ON finance_integration_audit_logs(tenant_id, company_id, branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS finance_integration_audit_logs_entity_idx
  ON finance_integration_audit_logs(resource, entity_id, created_at DESC);

INSERT INTO permissions (id, resource, action, description, "createdAt")
VALUES
  (gen_random_uuid()::text, 'financial_integrations', 'read', 'View financial integrations and reconciliation data', NOW()),
  (gen_random_uuid()::text, 'financial_integrations', 'manage', 'Manage financial integrations, credentials, sync, reconciliation and replay actions', NOW())
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO role_permissions ("roleId", "permissionId")
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.resource='financial_integrations' AND p.action IN ('read','manage')
WHERE r.slug='owner'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
