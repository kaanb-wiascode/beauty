CREATE TABLE IF NOT EXISTS approval_workflow_definitions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  "companyId" TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "workflowKey" TEXT NOT NULL,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  description TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdByUserId" TEXT NOT NULL REFERENCES users(id),
  "publishedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT approval_workflow_definition_version_unique UNIQUE ("tenantId", "companyId", "workflowKey", version)
);

CREATE INDEX IF NOT EXISTS approval_workflow_definitions_company_idx
  ON approval_workflow_definitions ("tenantId", "companyId", domain, status);

CREATE INDEX IF NOT EXISTS approval_workflow_definitions_key_idx
  ON approval_workflow_definitions ("tenantId", "companyId", "workflowKey", version DESC);
