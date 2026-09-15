CREATE TABLE IF NOT EXISTS hr_personnel_documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  document_number TEXT,
  title TEXT NOT NULL,
  issued_at DATE,
  expires_at DATE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','VERIFIED','REJECTED','EXPIRED','ARCHIVED')),
  file_key TEXT,
  file_name TEXT,
  mime_type TEXT,
  file_size BIGINT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  restricted BOOLEAN NOT NULL DEFAULT TRUE,
  verified_at TIMESTAMPTZ,
  verified_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  verification_note TEXT,
  notes TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (expires_at IS NULL OR issued_at IS NULL OR expires_at >= issued_at),
  CHECK (file_size IS NULL OR file_size >= 0)
);
CREATE INDEX IF NOT EXISTS idx_hr_personnel_documents_staff ON hr_personnel_documents(tenant_id,staff_id,status);
CREATE INDEX IF NOT EXISTS idx_hr_personnel_documents_expiry ON hr_personnel_documents(tenant_id,expires_at) WHERE expires_at IS NOT NULL AND status NOT IN ('ARCHIVED','REJECTED');
CREATE INDEX IF NOT EXISTS idx_hr_personnel_documents_type ON hr_personnel_documents(tenant_id,company_id,document_type);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_personnel_document_version ON hr_personnel_documents(tenant_id,staff_id,document_type,COALESCE(document_number,''),version);
