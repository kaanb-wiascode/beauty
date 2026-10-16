CREATE OR REPLACE FUNCTION release_operations_resources_on_appointment_terminal()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status::text IN ('CANCELLED', 'NO_SHOW')
     AND OLD.status::text IS DISTINCT FROM NEW.status::text THEN
    UPDATE operations_resource_allocations
       SET status = 'RELEASED',
           version = version + 1,
           updated_at = CURRENT_TIMESTAMP
     WHERE appointment_id = NEW.id
       AND status = 'RESERVED';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS appointments_release_operations_resources ON appointments;
CREATE TRIGGER appointments_release_operations_resources
AFTER UPDATE OF status ON appointments
FOR EACH ROW
EXECUTE FUNCTION release_operations_resources_on_appointment_terminal();
