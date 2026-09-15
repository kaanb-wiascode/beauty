CREATE TABLE IF NOT EXISTS hr_certification_types (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  requires_expiry BOOLEAN NOT NULL DEFAULT TRUE,
  default_validity_months INTEGER,
  warning_days INTEGER NOT NULL DEFAULT 30,
  service_eligibility_required BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT hr_certification_types_warning_days_chk CHECK (warning_days >= 0 AND warning_days <= 3650),
  CONSTRAINT hr_certification_types_validity_chk CHECK (default_validity_months IS NULL OR default_validity_months > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS hr_certification_types_company_code_uq ON hr_certification_types(tenant_id, company_id, code);
CREATE INDEX IF NOT EXISTS hr_certification_types_active_idx ON hr_certification_types(tenant_id, company_id, active);

CREATE TABLE IF NOT EXISTS hr_employee_certifications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  certification_type_id TEXT NOT NULL REFERENCES hr_certification_types(id) ON DELETE RESTRICT,
  credential_number TEXT,
  issuing_organization TEXT,
  qualification TEXT,
  issued_at DATE,
  expires_at DATE,
  status TEXT NOT NULL DEFAULT 'PENDING',
  evidence_document_id TEXT REFERENCES hr_personnel_documents(id) ON DELETE SET NULL,
  verified_at TIMESTAMP(3),
  verified_by TEXT,
  verification_note TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT hr_employee_certifications_status_chk CHECK (status IN ('PENDING','VERIFIED','REJECTED','EXPIRED','REVOKED')),
  CONSTRAINT hr_employee_certifications_dates_chk CHECK (expires_at IS NULL OR issued_at IS NULL OR expires_at >= issued_at)
);
CREATE INDEX IF NOT EXISTS hr_employee_certifications_staff_idx ON hr_employee_certifications(tenant_id, company_id, staff_id, status);
CREATE INDEX IF NOT EXISTS hr_employee_certifications_expiry_idx ON hr_employee_certifications(tenant_id, company_id, expires_at) WHERE status = 'VERIFIED';
CREATE UNIQUE INDEX IF NOT EXISTS hr_employee_certifications_credential_uq ON hr_employee_certifications(tenant_id, company_id, certification_type_id, credential_number) WHERE credential_number IS NOT NULL AND credential_number <> '';

CREATE TABLE IF NOT EXISTS hr_certification_service_eligibility (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  certification_type_id TEXT NOT NULL REFERENCES hr_certification_types(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS hr_certification_service_eligibility_uq ON hr_certification_service_eligibility(tenant_id, company_id, certification_type_id, service_id);
CREATE INDEX IF NOT EXISTS hr_certification_service_lookup_idx ON hr_certification_service_eligibility(tenant_id, company_id, service_id, required);
