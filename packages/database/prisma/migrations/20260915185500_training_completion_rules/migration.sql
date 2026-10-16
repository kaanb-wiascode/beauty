BEGIN;

CREATE OR REPLACE FUNCTION enforce_training_assignment_completion_rules()
RETURNS trigger AS $$
DECLARE
  required_count INTEGER;
  completed_required_count INTEGER;
  requires_theory BOOLEAN;
  requires_practical BOOLEAN;
  final_passed BOOLEAN;
BEGIN
  IF NEW.status <> 'COMPLETED' OR OLD.status = 'COMPLETED' OR NEW.course_version_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT v.requires_theory,v.requires_practical
    INTO requires_theory,requires_practical
  FROM training_course_versions v
  WHERE v.id=NEW.course_version_id
    AND v.tenant_id=NEW.tenant_id
    AND v.company_id=NEW.company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pinned course version is outside assignment scope';
  END IF;

  SELECT COUNT(*)::int,
         COUNT(*) FILTER (WHERE p.status='COMPLETED')::int
    INTO required_count,completed_required_count
  FROM training_lessons l
  LEFT JOIN training_lesson_progress p
    ON p.assignment_id=NEW.id
   AND p.lesson_id=l.id
   AND p.tenant_id=NEW.tenant_id
   AND p.company_id=NEW.company_id
  WHERE l.tenant_id=NEW.tenant_id
    AND l.company_id=NEW.company_id
    AND l.course_version_id=NEW.course_version_id
    AND l.is_required=true;

  IF completed_required_count < required_count THEN
    RAISE EXCEPTION 'All required lessons must be completed before the training assignment can be completed';
  END IF;

  IF COALESCE(requires_theory,false) OR COALESCE(requires_practical,false) THEN
    SELECT r.final_passed INTO final_passed
    FROM training_assignment_results r
    WHERE r.assignment_id=NEW.id
      AND r.tenant_id=NEW.tenant_id
      AND r.company_id=NEW.company_id
    LIMIT 1;

    IF COALESCE(final_passed,false) IS NOT TRUE THEN
      RAISE EXCEPTION 'Required assessment result must pass before the training assignment can be completed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS training_assignment_completion_rules_trg ON training_assignments;
CREATE TRIGGER training_assignment_completion_rules_trg
BEFORE UPDATE OF status ON training_assignments
FOR EACH ROW EXECUTE FUNCTION enforce_training_assignment_completion_rules();

CREATE OR REPLACE FUNCTION enforce_training_result_lesson_completion()
RETURNS trigger AS $$
DECLARE
  version_id TEXT;
  required_count INTEGER;
  completed_required_count INTEGER;
BEGIN
  SELECT a.course_version_id INTO version_id
  FROM training_assignments a
  WHERE a.id=NEW.assignment_id
    AND a.tenant_id=NEW.tenant_id
    AND a.company_id=NEW.company_id;

  IF version_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::int,
         COUNT(*) FILTER (WHERE p.status='COMPLETED')::int
    INTO required_count,completed_required_count
  FROM training_lessons l
  LEFT JOIN training_lesson_progress p
    ON p.assignment_id=NEW.assignment_id
   AND p.lesson_id=l.id
   AND p.tenant_id=NEW.tenant_id
   AND p.company_id=NEW.company_id
  WHERE l.tenant_id=NEW.tenant_id
    AND l.company_id=NEW.company_id
    AND l.course_version_id=version_id
    AND l.is_required=true;

  IF completed_required_count < required_count THEN
    RAISE EXCEPTION 'All required lessons must be completed before assessment results can be finalized';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS training_result_lesson_completion_trg ON training_assignment_results;
CREATE TRIGGER training_result_lesson_completion_trg
BEFORE INSERT OR UPDATE ON training_assignment_results
FOR EACH ROW EXECUTE FUNCTION enforce_training_result_lesson_completion();

COMMIT;
