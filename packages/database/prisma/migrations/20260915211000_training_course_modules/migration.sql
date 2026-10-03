BEGIN;

CREATE TABLE IF NOT EXISTS training_course_modules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  course_version_id TEXT NOT NULL REFERENCES training_course_versions(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT training_course_modules_sequence_chk CHECK(sequence >= 1),
  UNIQUE(course_version_id,sequence)
);

CREATE INDEX IF NOT EXISTS training_course_modules_scope_idx
  ON training_course_modules(tenant_id,company_id,course_version_id,sequence);

ALTER TABLE training_lessons
  ADD COLUMN IF NOT EXISTS module_id TEXT REFERENCES training_course_modules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS training_lessons_module_idx
  ON training_lessons(tenant_id,company_id,course_version_id,module_id,sequence);

CREATE OR REPLACE FUNCTION enforce_training_lesson_module_scope()
RETURNS trigger AS $$
DECLARE
  module_tenant TEXT;
  module_company TEXT;
  module_version TEXT;
BEGIN
  IF NEW.module_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT tenant_id, company_id, course_version_id
    INTO module_tenant, module_company, module_version
  FROM training_course_modules
  WHERE id = NEW.module_id;

  IF module_tenant IS NULL
     OR module_tenant <> NEW.tenant_id
     OR module_company <> NEW.company_id
     OR module_version <> NEW.course_version_id THEN
    RAISE EXCEPTION 'training lesson module scope mismatch';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS training_lesson_module_scope_guard ON training_lessons;
CREATE TRIGGER training_lesson_module_scope_guard
BEFORE INSERT OR UPDATE OF module_id, tenant_id, company_id, course_version_id
ON training_lessons
FOR EACH ROW EXECUTE FUNCTION enforce_training_lesson_module_scope();

COMMIT;
