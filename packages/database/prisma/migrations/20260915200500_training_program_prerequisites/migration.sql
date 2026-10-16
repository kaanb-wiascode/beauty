BEGIN;

CREATE TABLE IF NOT EXISTS training_program_item_prerequisites (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  program_version_id TEXT NOT NULL,
  program_item_id TEXT NOT NULL,
  prerequisite_item_id TEXT NOT NULL,
  created_by_user_id TEXT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT training_program_item_prereq_item_fk FOREIGN KEY (program_item_id) REFERENCES training_program_items(id) ON DELETE CASCADE,
  CONSTRAINT training_program_item_prereq_required_fk FOREIGN KEY (prerequisite_item_id) REFERENCES training_program_items(id) ON DELETE CASCADE,
  CONSTRAINT training_program_item_prereq_version_fk FOREIGN KEY (program_version_id) REFERENCES training_program_versions(id) ON DELETE CASCADE,
  CONSTRAINT training_program_item_prereq_not_self CHECK (program_item_id <> prerequisite_item_id),
  CONSTRAINT training_program_item_prereq_unique UNIQUE (program_item_id, prerequisite_item_id)
);

CREATE INDEX IF NOT EXISTS training_program_item_prereq_scope_idx
  ON training_program_item_prerequisites(tenant_id, company_id, program_version_id, program_item_id);

CREATE OR REPLACE FUNCTION training_program_item_prereq_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  item_version TEXT;
  prerequisite_version TEXT;
  item_tenant TEXT;
  item_company TEXT;
  prerequisite_tenant TEXT;
  prerequisite_company TEXT;
BEGIN
  SELECT program_version_id, tenant_id, company_id
    INTO item_version, item_tenant, item_company
    FROM training_program_items WHERE id = NEW.program_item_id;
  SELECT program_version_id, tenant_id, company_id
    INTO prerequisite_version, prerequisite_tenant, prerequisite_company
    FROM training_program_items WHERE id = NEW.prerequisite_item_id;

  IF item_version IS NULL OR prerequisite_version IS NULL THEN
    RAISE EXCEPTION 'Learning path item not found';
  END IF;
  IF item_version <> prerequisite_version OR item_version <> NEW.program_version_id THEN
    RAISE EXCEPTION 'Learning path prerequisite items must belong to the same program version';
  END IF;
  IF item_tenant <> NEW.tenant_id OR prerequisite_tenant <> NEW.tenant_id
     OR item_company <> NEW.company_id OR prerequisite_company <> NEW.company_id THEN
    RAISE EXCEPTION 'Learning path prerequisite scope mismatch';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_training_program_item_prereq_scope ON training_program_item_prerequisites;
CREATE TRIGGER trg_training_program_item_prereq_scope
BEFORE INSERT OR UPDATE ON training_program_item_prerequisites
FOR EACH ROW EXECUTE FUNCTION training_program_item_prereq_scope_guard();

COMMIT;
