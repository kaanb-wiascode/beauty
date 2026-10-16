BEGIN;

CREATE TABLE IF NOT EXISTS training_competency_outcomes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  course_version_id TEXT NOT NULL REFERENCES training_course_versions(id) ON DELETE CASCADE,
  competency_id TEXT NOT NULL REFERENCES competency_definitions(id) ON DELETE RESTRICT,
  score_source TEXT NOT NULL,
  fixed_score NUMERIC(5,2),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT training_competency_outcomes_source_chk CHECK(score_source IN ('THEORY','PRACTICAL','AVERAGE','FIXED')),
  CONSTRAINT training_competency_outcomes_fixed_chk CHECK(
    (score_source='FIXED' AND fixed_score BETWEEN 0 AND 100)
    OR (score_source<>'FIXED' AND fixed_score IS NULL)
  ),
  UNIQUE(tenant_id,company_id,course_version_id,competency_id)
);

ALTER TABLE staff_competency_assessments
  ADD COLUMN IF NOT EXISTS source_assignment_id TEXT REFERENCES training_assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_result_id TEXT REFERENCES training_assignment_results(assignment_id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS staff_competency_training_result_uniq
  ON staff_competency_assessments(tenant_id,company_id,staff_id,competency_id,source_result_id)
  WHERE source_type='TRAINING' AND source_result_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS training_competency_bridge_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  assignment_id TEXT NOT NULL REFERENCES training_assignments(id) ON DELETE CASCADE,
  course_version_id TEXT NOT NULL REFERENCES training_course_versions(id) ON DELETE RESTRICT,
  competency_id TEXT REFERENCES competency_definitions(id) ON DELETE SET NULL,
  assessment_id TEXT REFERENCES staff_competency_assessments(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  score NUMERIC(5,2),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT training_competency_bridge_event_chk CHECK(event_type IN ('ASSESSMENT_CREATED','SKIPPED_NOT_PASSED','SKIPPED_NO_STAFF','SKIPPED_NO_SCORE','DUPLICATE')),
  CONSTRAINT training_competency_bridge_score_chk CHECK(score IS NULL OR score BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS training_competency_outcomes_version_idx
  ON training_competency_outcomes(tenant_id,company_id,course_version_id);
CREATE INDEX IF NOT EXISTS training_competency_bridge_events_assignment_idx
  ON training_competency_bridge_events(tenant_id,company_id,assignment_id,created_at DESC);
CREATE INDEX IF NOT EXISTS training_competency_pending_results_idx
  ON training_assignment_results(tenant_id,company_id,final_passed,finalized_at)
  WHERE final_passed=true;

CREATE OR REPLACE FUNCTION prevent_published_training_competency_outcome_mutation()
RETURNS trigger AS $$
DECLARE version_status TEXT;
BEGIN
  SELECT status INTO version_status FROM training_course_versions WHERE id=COALESCE(NEW.course_version_id,OLD.course_version_id);
  IF version_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Published or retired training competency outcomes are immutable';
  END IF;
  RETURN COALESCE(NEW,OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS training_competency_outcomes_immutable_trg ON training_competency_outcomes;
CREATE TRIGGER training_competency_outcomes_immutable_trg
BEFORE UPDATE OR DELETE ON training_competency_outcomes
FOR EACH ROW EXECUTE FUNCTION prevent_published_training_competency_outcome_mutation();

COMMIT;
