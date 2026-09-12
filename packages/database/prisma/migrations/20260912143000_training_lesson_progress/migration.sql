BEGIN;

CREATE TABLE IF NOT EXISTS training_lesson_progress (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  assignment_id TEXT NOT NULL REFERENCES training_assignments(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL REFERENCES training_lessons(id) ON DELETE CASCADE,
  staff_id TEXT REFERENCES staff(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'NOT_STARTED',
  started_at TIMESTAMP(3),
  completed_at TIMESTAMP(3),
  completed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT training_lesson_progress_status_chk CHECK(status IN ('NOT_STARTED','IN_PROGRESS','COMPLETED')),
  CONSTRAINT training_lesson_progress_time_chk CHECK(completed_at IS NULL OR started_at IS NOT NULL),
  UNIQUE(tenant_id,company_id,assignment_id,lesson_id)
);

CREATE TABLE IF NOT EXISTS training_lesson_progress_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  assignment_id TEXT NOT NULL REFERENCES training_assignments(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL REFERENCES training_lessons(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT training_lesson_progress_event_chk CHECK(event_type IN ('STARTED','COMPLETED'))
);

CREATE INDEX IF NOT EXISTS training_lesson_progress_assignment_idx
  ON training_lesson_progress(tenant_id,company_id,assignment_id,status);
CREATE INDEX IF NOT EXISTS training_lesson_progress_staff_idx
  ON training_lesson_progress(tenant_id,company_id,staff_id,status)
  WHERE staff_id IS NOT NULL;

CREATE OR REPLACE FUNCTION guard_training_final_result_required_lessons()
RETURNS trigger AS $$
DECLARE required_count INTEGER;
DECLARE completed_count INTEGER;
BEGIN
  IF NEW.final_passed IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO required_count
  FROM training_lessons l
  WHERE l.tenant_id=NEW.tenant_id AND l.company_id=NEW.company_id
    AND l.course_version_id=NEW.course_version_id AND l.is_required=true;

  IF required_count=0 THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO completed_count
  FROM training_lesson_progress p
  JOIN training_lessons l ON l.id=p.lesson_id
  WHERE p.tenant_id=NEW.tenant_id AND p.company_id=NEW.company_id
    AND p.assignment_id=NEW.assignment_id AND p.status='COMPLETED'
    AND l.course_version_id=NEW.course_version_id AND l.is_required=true;

  IF completed_count < required_count THEN
    RAISE EXCEPTION 'Required training lessons must be completed before a passing final result can be recorded';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS training_assignment_results_required_lessons_trg ON training_assignment_results;
CREATE TRIGGER training_assignment_results_required_lessons_trg
BEFORE INSERT OR UPDATE OF final_passed ON training_assignment_results
FOR EACH ROW EXECUTE FUNCTION guard_training_final_result_required_lessons();

COMMIT;
