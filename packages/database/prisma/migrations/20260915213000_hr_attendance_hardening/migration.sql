ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS scheduled_shift_id TEXT,
  ADD COLUMN IF NOT EXISTS late_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS early_departure_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS missing_punch BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS absence BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS holiday_work BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS weekly_rest_work BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS exception_status TEXT NOT NULL DEFAULT 'NONE';

ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_scheduled_shift_fk
  FOREIGN KEY (scheduled_shift_id) REFERENCES hr_scheduled_shifts(id) ON DELETE SET NULL;
ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_late_minutes_check CHECK (late_minutes >= 0),
  ADD CONSTRAINT attendance_records_early_departure_minutes_check CHECK (early_departure_minutes >= 0),
  ADD CONSTRAINT attendance_records_exception_status_check CHECK (exception_status IN ('NONE','OPEN','REVIEWED','CORRECTED','WAIVED'));

CREATE INDEX IF NOT EXISTS attendance_records_exception_idx ON attendance_records(tenant_id,branch_id,work_date,exception_status);
CREATE INDEX IF NOT EXISTS attendance_records_scheduled_shift_idx ON attendance_records(tenant_id,scheduled_shift_id);

CREATE TABLE IF NOT EXISTS hr_attendance_corrections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  attendance_record_id TEXT NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  previous_value JSONB NOT NULL,
  new_value JSONB NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (length(trim(reason)) > 0)
);
CREATE INDEX IF NOT EXISTS hr_attendance_corrections_record_idx ON hr_attendance_corrections(tenant_id,company_id,attendance_record_id,created_at DESC);
CREATE INDEX IF NOT EXISTS hr_attendance_corrections_staff_idx ON hr_attendance_corrections(tenant_id,company_id,staff_id,created_at DESC);
