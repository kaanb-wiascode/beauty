BEGIN;

CREATE OR REPLACE FUNCTION training_learning_path_prerequisite_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_item_id TEXT;
  blocked_count INTEGER;
BEGIN
  IF NEW.source_type <> 'LEARNING_PROGRAM'
     OR NEW.program_assignment_id IS NULL
     OR NEW.status NOT IN ('IN_PROGRESS','COMPLETED')
     OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT i.id
    INTO current_item_id
    FROM training_program_items i
   WHERE i.tenant_id = NEW.tenant_id
     AND i.company_id = NEW.company_id
     AND NEW.source_key = ('learning-program:' || NEW.program_assignment_id || ':' || i.id)
   LIMIT 1;

  IF current_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::int
    INTO blocked_count
    FROM training_program_item_prerequisites prerequisite
    LEFT JOIN training_assignments prerequisite_assignment
      ON prerequisite_assignment.tenant_id = NEW.tenant_id
     AND prerequisite_assignment.company_id = NEW.company_id
     AND prerequisite_assignment.program_assignment_id = NEW.program_assignment_id
     AND prerequisite_assignment.source_key = ('learning-program:' || NEW.program_assignment_id || ':' || prerequisite.prerequisite_item_id)
   WHERE prerequisite.tenant_id = NEW.tenant_id
     AND prerequisite.company_id = NEW.company_id
     AND prerequisite.program_item_id = current_item_id
     AND COALESCE(prerequisite_assignment.status,'ASSIGNED') <> 'COMPLETED';

  IF blocked_count > 0 THEN
    RAISE EXCEPTION 'Learning path prerequisites are not completed for assignment %', NEW.id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_training_learning_path_prerequisite_guard ON training_assignments;
CREATE TRIGGER trg_training_learning_path_prerequisite_guard
BEFORE UPDATE OF status ON training_assignments
FOR EACH ROW
EXECUTE FUNCTION training_learning_path_prerequisite_guard();

COMMIT;
