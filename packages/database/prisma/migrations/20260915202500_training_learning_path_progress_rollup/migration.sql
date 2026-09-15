BEGIN;

CREATE OR REPLACE FUNCTION training_learning_path_rollup_progress()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  pa training_program_assignments%ROWTYPE;
  required_count INTEGER;
  completed_required_count INTEGER;
  next_status TEXT;
  actor_id TEXT;
BEGIN
  IF NEW.program_assignment_id IS NULL OR NEW.source_type <> 'LEARNING_PROGRAM' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO pa
    FROM training_program_assignments
   WHERE id = NEW.program_assignment_id
     AND tenant_id = NEW.tenant_id
     AND company_id = NEW.company_id
   FOR UPDATE;

  IF pa.id IS NULL OR pa.status IN ('COMPLETED','CANCELLED') THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::int,
         COUNT(*) FILTER (WHERE assignment.status = 'COMPLETED')::int
    INTO required_count, completed_required_count
    FROM training_program_items item
    LEFT JOIN training_assignments assignment
      ON assignment.tenant_id = pa.tenant_id
     AND assignment.company_id = pa.company_id
     AND assignment.program_assignment_id = pa.id
     AND assignment.source_key = ('learning-program:' || pa.id || ':' || item.id)
   WHERE item.tenant_id = pa.tenant_id
     AND item.company_id = pa.company_id
     AND item.program_version_id = pa.program_version_id
     AND item.is_required = true;

  IF required_count > 0 AND completed_required_count = required_count THEN
    next_status := 'COMPLETED';
  ELSIF EXISTS (
    SELECT 1 FROM training_assignments child
     WHERE child.tenant_id = pa.tenant_id
       AND child.company_id = pa.company_id
       AND child.program_assignment_id = pa.id
       AND child.status IN ('IN_PROGRESS','COMPLETED')
  ) THEN
    next_status := 'IN_PROGRESS';
  ELSE
    next_status := 'ASSIGNED';
  END IF;

  IF next_status = pa.status THEN
    RETURN NEW;
  END IF;

  actor_id := COALESCE(NEW.completed_by_user_id, NEW.updated_by_user_id);

  UPDATE training_program_assignments
     SET status = next_status,
         completed_at = CASE WHEN next_status = 'COMPLETED' THEN COALESCE(completed_at, now()) ELSE NULL END,
         updated_at = now()
   WHERE id = pa.id;

  INSERT INTO training_program_events(
    tenant_id, company_id, branch_id, program_id, program_version_id,
    program_assignment_id, event_type, actor_user_id, metadata
  ) VALUES (
    pa.tenant_id, pa.company_id, pa.branch_id, pa.program_id, pa.program_version_id,
    pa.id,
    CASE WHEN next_status = 'COMPLETED' THEN 'COMPLETED' ELSE 'COURSE_ASSIGNMENTS_CREATED' END,
    actor_id,
    jsonb_build_object(
      'fromStatus', pa.status,
      'toStatus', next_status,
      'requiredItems', required_count,
      'completedRequiredItems', completed_required_count,
      'sourceAssignmentId', NEW.id,
      'rollup', true
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_training_learning_path_rollup_progress ON training_assignments;
CREATE TRIGGER trg_training_learning_path_rollup_progress
AFTER UPDATE OF status ON training_assignments
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION training_learning_path_rollup_progress();

COMMIT;
