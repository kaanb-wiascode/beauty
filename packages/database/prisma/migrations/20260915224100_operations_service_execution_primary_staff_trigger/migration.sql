CREATE OR REPLACE FUNCTION operations_seed_execution_primary_staff_assignment()
RETURNS trigger AS $$
BEGIN
  INSERT INTO operations_service_execution_staff_assignments(
    execution_id,tenant_id,company_id,branch_id,staff_id,role,started_at,note,created_by_membership_id
  ) VALUES(
    NEW.id,NEW.tenant_id,NEW.company_id,NEW.branch_id,NEW.staff_id,
    'PRIMARY'::"ServiceExecutionStaffRole",NEW.started_at,'Initial primary staff assignment',NEW.created_by_membership_id
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER operations_service_execution_primary_staff_assignment_trigger
AFTER INSERT ON operations_service_executions
FOR EACH ROW EXECUTE FUNCTION operations_seed_execution_primary_staff_assignment();
