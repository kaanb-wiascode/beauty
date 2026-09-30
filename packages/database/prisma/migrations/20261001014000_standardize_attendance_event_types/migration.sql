DROP TRIGGER IF EXISTS hr_attendance_events_immutable_update
  ON hr_attendance_events;

ALTER TABLE hr_attendance_events
  DROP CONSTRAINT IF EXISTS hr_attendance_events_type_check;

UPDATE hr_attendance_events
SET event_type = CASE event_type
  WHEN 'DAY_START' THEN 'CLOCK_IN'
  WHEN 'DAY_END' THEN 'CLOCK_OUT'
  ELSE event_type
END
WHERE event_type IN ('DAY_START', 'DAY_END');

CREATE OR REPLACE FUNCTION normalize_hr_attendance_event_type()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.event_type = 'DAY_START' THEN
    NEW.event_type := 'CLOCK_IN';
  ELSIF NEW.event_type = 'DAY_END' THEN
    NEW.event_type := 'CLOCK_OUT';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hr_attendance_events_normalize_type
  ON hr_attendance_events;
CREATE TRIGGER hr_attendance_events_normalize_type
BEFORE INSERT ON hr_attendance_events
FOR EACH ROW
EXECUTE FUNCTION normalize_hr_attendance_event_type();

ALTER TABLE hr_attendance_events
  ADD CONSTRAINT hr_attendance_events_type_check
  CHECK (event_type IN ('CLOCK_IN', 'BREAK_START', 'BREAK_END', 'CLOCK_OUT'));

CREATE TRIGGER hr_attendance_events_immutable_update
BEFORE UPDATE ON hr_attendance_events
FOR EACH ROW
EXECUTE FUNCTION prevent_hr_attendance_event_mutation();
