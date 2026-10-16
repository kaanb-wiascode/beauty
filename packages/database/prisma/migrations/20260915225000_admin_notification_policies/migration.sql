CREATE TABLE IF NOT EXISTS admin_notification_policies (
  id TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  audience TEXT NOT NULL,
  channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT admin_notification_policies_tenant_fk FOREIGN KEY ("tenantId") REFERENCES tenants(id) ON DELETE RESTRICT,
  CONSTRAINT admin_notification_policies_company_fk FOREIGN KEY ("companyId") REFERENCES companies(id) ON DELETE RESTRICT,
  CONSTRAINT admin_notification_policies_user_fk FOREIGN KEY ("createdByUserId") REFERENCES users(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_notification_policies_scope_event_audience_uq
  ON admin_notification_policies("tenantId","companyId","eventKey",audience);

CREATE INDEX IF NOT EXISTS admin_notification_policies_scope_idx
  ON admin_notification_policies("tenantId","companyId",enabled);
