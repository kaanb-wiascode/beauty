BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS training_course_versions_scope_id_uq
  ON training_course_versions(tenant_id, company_id, id);

ALTER TABLE training_managed_documents
  ADD CONSTRAINT training_managed_documents_version_scope_fkey
  FOREIGN KEY (tenant_id, company_id, course_version_id)
  REFERENCES training_course_versions(tenant_id, company_id, id)
  ON DELETE CASCADE
  ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE training_managed_documents
  VALIDATE CONSTRAINT training_managed_documents_version_scope_fkey;

COMMIT;
