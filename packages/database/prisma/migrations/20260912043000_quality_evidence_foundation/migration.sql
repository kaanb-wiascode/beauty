BEGIN;

CREATE TABLE IF NOT EXISTS quality_evidence (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  inspection_id TEXT,
  inspection_result_id TEXT,
  finding_id TEXT,
  quality_case_id TEXT,
  capa_id TEXT,
  kind TEXT NOT NULL,
  object_key TEXT NOT NULL,
  original_filename TEXT,
  mime_type TEXT,
  byte_size BIGINT,
  sha256 TEXT,
  note TEXT,
  captured_at TIMESTAMP(3),
  uploaded_by_user_id TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quality_evidence_kind_chk CHECK (kind IN ('PHOTO','DOCUMENT','OTHER')) NOT VALID,
  CONSTRAINT quality_evidence_size_chk CHECK (byte_size IS NULL OR byte_size >= 0) NOT VALID,
  CONSTRAINT quality_evidence_sha_chk CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-fA-F]{64}$') NOT VALID,
  CONSTRAINT quality_evidence_parent_chk CHECK (
    num_nonnulls(inspection_id,inspection_result_id,finding_id,quality_case_id,capa_id) = 1
  ) NOT VALID,
  UNIQUE (tenant_id, company_id, object_key)
);

CREATE INDEX IF NOT EXISTS quality_evidence_scope_idx
  ON quality_evidence(tenant_id, company_id, branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quality_evidence_inspection_idx
  ON quality_evidence(inspection_id, created_at DESC) WHERE inspection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS quality_evidence_result_idx
  ON quality_evidence(inspection_result_id, created_at DESC) WHERE inspection_result_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS quality_evidence_finding_idx
  ON quality_evidence(finding_id, created_at DESC) WHERE finding_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS quality_evidence_case_idx
  ON quality_evidence(quality_case_id, created_at DESC) WHERE quality_case_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS quality_evidence_capa_idx
  ON quality_evidence(capa_id, created_at DESC) WHERE capa_id IS NOT NULL;

ALTER TABLE quality_evidence ADD CONSTRAINT quality_evidence_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE quality_evidence ADD CONSTRAINT quality_evidence_company_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_evidence ADD CONSTRAINT quality_evidence_branch_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_evidence ADD CONSTRAINT quality_evidence_inspection_fkey FOREIGN KEY (inspection_id) REFERENCES quality_inspections(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE quality_evidence ADD CONSTRAINT quality_evidence_result_fkey FOREIGN KEY (inspection_result_id) REFERENCES quality_inspection_results(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE quality_evidence ADD CONSTRAINT quality_evidence_finding_fkey FOREIGN KEY (finding_id) REFERENCES quality_findings(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE quality_evidence ADD CONSTRAINT quality_evidence_case_fkey FOREIGN KEY (quality_case_id) REFERENCES quality_cases(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE quality_evidence ADD CONSTRAINT quality_evidence_capa_fkey FOREIGN KEY (capa_id) REFERENCES quality_capa_plans(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE quality_evidence ADD CONSTRAINT quality_evidence_uploaded_by_fkey FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
