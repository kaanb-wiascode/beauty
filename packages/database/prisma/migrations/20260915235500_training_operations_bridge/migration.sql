-- Bridge Training outcomes into the HR eligibility model consumed by Operations.

CREATE TABLE training_hr_competency_mappings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  training_competency_id TEXT NOT NULL REFERENCES competency_definitions(id) ON DELETE CASCADE,
  hr_competency_id TEXT NOT NULL REFERENCES hr_competencies(id) ON DELETE CASCADE,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, company_id, training_competency_id),
  UNIQUE (tenant_id, company_id, hr_competency_id)
);

CREATE TABLE training_hr_certification_mappings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  hr_certification_type_id TEXT NOT NULL REFERENCES hr_certification_types(id) ON DELETE CASCADE,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, company_id, course_id)
);

CREATE TABLE training_operations_bridge_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NULL REFERENCES branches(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('COMPETENCY_ASSESSMENT','TRAINING_CERTIFICATE')),
  source_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('HR_COMPETENCY_ASSESSMENT','HR_EMPLOYEE_CERTIFICATION')),
  target_id TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, company_id, source_type, source_id, target_type)
);

CREATE INDEX training_operations_bridge_events_scope_idx
  ON training_operations_bridge_events(tenant_id, company_id, branch_id, created_at DESC);

CREATE OR REPLACE FUNCTION pin_competency_gap_course_version()
RETURNS trigger AS $$
BEGIN
  IF NEW.source_type = 'COMPETENCY_GAP' AND NEW.course_version_id IS NULL THEN
    SELECT v.id INTO NEW.course_version_id
    FROM training_course_versions v
    WHERE v.tenant_id=NEW.tenant_id AND v.company_id=NEW.company_id
      AND v.course_id=NEW.course_id AND v.status='PUBLISHED'
      AND v.effective_from<=CURRENT_DATE
      AND (v.effective_to IS NULL OR v.effective_to>=CURRENT_DATE)
    ORDER BY v.version DESC
    LIMIT 1;
    IF NEW.course_version_id IS NULL THEN
      RAISE EXCEPTION 'Competency-gap assignment requires a published course version';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS training_competency_gap_version_pin_trg ON training_assignments;
CREATE TRIGGER training_competency_gap_version_pin_trg
BEFORE INSERT ON training_assignments
FOR EACH ROW EXECUTE FUNCTION pin_competency_gap_course_version();
