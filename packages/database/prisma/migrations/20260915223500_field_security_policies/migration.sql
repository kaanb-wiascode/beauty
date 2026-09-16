CREATE TABLE IF NOT EXISTS field_security_policies (
  id TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "fieldGroup" TEXT NOT NULL,
  "requiredResource" TEXT NOT NULL,
  "requiredAction" TEXT NOT NULL,
  description TEXT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT field_security_policies_tenant_fk FOREIGN KEY ("tenantId") REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT field_security_policies_company_fk FOREIGN KEY ("companyId") REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT field_security_policies_creator_fk FOREIGN KEY ("createdByUserId") REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT field_security_policies_group_unique UNIQUE ("tenantId", "companyId", "fieldGroup")
);

CREATE INDEX IF NOT EXISTS field_security_policies_company_idx
  ON field_security_policies ("tenantId", "companyId");
