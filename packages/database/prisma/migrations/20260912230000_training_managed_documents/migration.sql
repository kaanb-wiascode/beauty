BEGIN;

CREATE TABLE IF NOT EXISTS training_managed_documents (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  course_version_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL,
  etag TEXT,
  verified_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT training_managed_documents_size_chk CHECK (byte_size >= 0) NOT VALID,
  UNIQUE (tenant_id, company_id, object_key)
);

CREATE INDEX IF NOT EXISTS training_managed_documents_version_idx
  ON training_managed_documents(tenant_id, company_id, course_version_id, verified_at DESC);

ALTER TABLE training_managed_documents
  ADD CONSTRAINT training_managed_documents_tenant_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE training_managed_documents
  ADD CONSTRAINT training_managed_documents_company_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE training_managed_documents
  ADD CONSTRAINT training_managed_documents_version_fkey
  FOREIGN KEY (course_version_id) REFERENCES training_course_versions(id) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION enforce_training_lesson_managed_document()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.content_type = 'DOCUMENT' THEN
    IF NEW.content_ref IS NULL OR BTRIM(NEW.content_ref) = '' THEN
      RAISE EXCEPTION 'DOCUMENT lesson requires a verified managed content_ref' USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM training_managed_documents d
      WHERE d.tenant_id = NEW.tenant_id
        AND d.company_id = NEW.company_id
        AND d.course_version_id = NEW.course_version_id
        AND d.object_key = NEW.content_ref
    ) THEN
      RAISE EXCEPTION 'DOCUMENT lesson content_ref is not verified for this course version' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS training_lessons_managed_document_guard ON training_lessons;
CREATE TRIGGER training_lessons_managed_document_guard
BEFORE INSERT OR UPDATE OF content_type, content_ref, course_version_id
ON training_lessons
FOR EACH ROW
EXECUTE FUNCTION enforce_training_lesson_managed_document();

COMMIT;
