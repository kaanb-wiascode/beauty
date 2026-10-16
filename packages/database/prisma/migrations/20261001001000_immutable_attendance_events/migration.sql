CREATE TABLE IF NOT EXISTS hr_attendance_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source TEXT NOT NULL DEFAULT 'SELF_SERVICE',
  device_context JSONB,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT hr_attendance_events_type_check
    CHECK (event_type IN ('DAY_START','BREAK_START','BREAK_END','DAY_END')),
  CONSTRAINT hr_attendance_events_source_check
    CHECK (source IN ('SELF_SERVICE','SYSTEM','IMPORT'))
);

CREATE INDEX IF NOT EXISTS hr_attendance_events_staff_time_idx
  ON hr_attendance_events(tenant_id,company_id,staff_id,occurred_at DESC);

CREATE INDEX IF NOT EXISTS hr_attendance_events_branch_time_idx
  ON hr_attendance_events(tenant_id,company_id,branch_id,occurred_at DESC);

CREATE OR REPLACE FUNCTION prevent_hr_attendance_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Attendance raw events are immutable';
END;
$$;

DROP TRIGGER IF EXISTS hr_attendance_events_immutable_update
  ON hr_attendance_events;
CREATE TRIGGER hr_attendance_events_immutable_update
BEFORE UPDATE ON hr_attendance_events
FOR EACH ROW
EXECUTE FUNCTION prevent_hr_attendance_event_mutation();

DROP TRIGGER IF EXISTS hr_attendance_events_immutable_delete
  ON hr_attendance_events;
CREATE TRIGGER hr_attendance_events_immutable_delete
BEFORE DELETE ON hr_attendance_events
FOR EACH ROW
EXECUTE FUNCTION prevent_hr_attendance_event_mutation();
