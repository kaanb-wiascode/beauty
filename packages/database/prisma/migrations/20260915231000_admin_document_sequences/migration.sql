CREATE TABLE IF NOT EXISTS admin_document_sequences (
  id TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "branchId" TEXT,
  "documentType" TEXT NOT NULL,
  prefix TEXT NOT NULL,
  "yearScoped" BOOLEAN NOT NULL DEFAULT TRUE,
  padding INTEGER NOT NULL DEFAULT 6,
  "currentYear" INTEGER,
  "currentValue" BIGINT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT admin_document_sequences_tenant_fk FOREIGN KEY ("tenantId") REFERENCES tenants(id) ON DELETE RESTRICT,
  CONSTRAINT admin_document_sequences_company_fk FOREIGN KEY ("companyId") REFERENCES companies(id) ON DELETE RESTRICT,
  CONSTRAINT admin_document_sequences_branch_fk FOREIGN KEY ("branchId") REFERENCES branches(id) ON DELETE RESTRICT,
  CONSTRAINT admin_document_sequences_padding_ck CHECK (padding BETWEEN 1 AND 12),
  CONSTRAINT admin_document_sequences_current_value_ck CHECK ("currentValue" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_document_sequences_scope_type_uq
  ON admin_document_sequences("tenantId","companyId",COALESCE("branchId",''),"documentType");

CREATE INDEX IF NOT EXISTS admin_document_sequences_scope_idx
  ON admin_document_sequences("tenantId","companyId",active);
