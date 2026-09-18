BEGIN;

CREATE OR REPLACE FUNCTION training_pin_published_course_version()
RETURNS trigger AS $$
BEGIN
  IF NEW.course_version_id IS NULL THEN
    SELECT v.id INTO NEW.course_version_id
    FROM training_course_versions v
    WHERE v.tenant_id=NEW.tenant_id
      AND v.company_id=NEW.company_id
      AND v.course_id=NEW.course_id
      AND v.status='PUBLISHED'
      AND (v.effective_from IS NULL OR v.effective_from<=CURRENT_DATE)
      AND (v.effective_to IS NULL OR v.effective_to>=CURRENT_DATE)
    ORDER BY v.version DESC
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS training_assignments_pin_version_trg ON training_assignments;
CREATE TRIGGER training_assignments_pin_version_trg
BEFORE INSERT ON training_assignments
FOR EACH ROW EXECUTE FUNCTION training_pin_published_course_version();

CREATE OR REPLACE FUNCTION training_assignment_completion_guard()
RETURNS trigger AS $$
BEGIN
  IF NEW.status='COMPLETED'
     AND OLD.status IS DISTINCT FROM 'COMPLETED'
     AND NEW.course_version_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM training_assignment_results r
       WHERE r.assignment_id=NEW.id
         AND r.tenant_id=NEW.tenant_id
         AND r.company_id=NEW.company_id
         AND r.course_version_id=NEW.course_version_id
         AND r.final_passed=true
     ) THEN
    RAISE EXCEPTION 'Versioned training assignment requires a passing finalized result before completion.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS training_assignments_completion_guard_trg ON training_assignments;
CREATE TRIGGER training_assignments_completion_guard_trg
BEFORE UPDATE OF status ON training_assignments
FOR EACH ROW EXECUTE FUNCTION training_assignment_completion_guard();

CREATE OR REPLACE FUNCTION training_published_content_guard()
RETURNS trigger AS $$
DECLARE
  version_id TEXT;
  version_status TEXT;
BEGIN
  IF TG_TABLE_NAME='training_exam_questions' THEN
    IF TG_OP='DELETE' THEN
      SELECT e.course_version_id INTO version_id FROM training_exams e WHERE e.id=OLD.exam_id;
    ELSE
      SELECT e.course_version_id INTO version_id FROM training_exams e WHERE e.id=NEW.exam_id;
    END IF;
  ELSE
    IF TG_OP='DELETE' THEN
      version_id:=OLD.course_version_id;
    ELSE
      version_id:=NEW.course_version_id;
    END IF;
  END IF;

  SELECT status INTO version_status FROM training_course_versions WHERE id=version_id;
  IF version_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'Published or retired training content is immutable; create a new course version.' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS training_lessons_immutable_trg ON training_lessons;
CREATE TRIGGER training_lessons_immutable_trg
BEFORE UPDATE OR DELETE ON training_lessons
FOR EACH ROW EXECUTE FUNCTION training_published_content_guard();

DROP TRIGGER IF EXISTS training_exams_immutable_trg ON training_exams;
CREATE TRIGGER training_exams_immutable_trg
BEFORE UPDATE OR DELETE ON training_exams
FOR EACH ROW EXECUTE FUNCTION training_published_content_guard();

DROP TRIGGER IF EXISTS training_exam_questions_immutable_trg ON training_exam_questions;
CREATE TRIGGER training_exam_questions_immutable_trg
BEFORE UPDATE OR DELETE ON training_exam_questions
FOR EACH ROW EXECUTE FUNCTION training_published_content_guard();

COMMIT;
