CREATE TABLE IF NOT EXISTS hr_overtime_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  attendance_record_id TEXT REFERENCES attendance_records(id) ON DELETE SET NULL,
  scheduled_shift_id TEXT REFERENCES hr_scheduled_shifts(id) ON DELETE SET NULL,
  work_date DATE NOT NULL,
  source TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (source IN ('REQUESTED','DETECTED')),
  requested_minutes INTEGER NOT NULL DEFAULT 0 CHECK (requested_minutes >= 0),
  detected_minutes INTEGER NOT NULL DEFAULT 0 CHECK (detected_minutes >= 0),
  approved_minutes INTEGER NOT NULL DEFAULT 0 CHECK (approved_minutes >= 0),
  treatment TEXT NOT NULL DEFAULT 'PAYROLL' CHECK (treatment IN ('PAYROLL','TIME_OFF_IN_LIEU','NONE')),
  status TEXT NOT NULL DEFAULT 'PENDING_MANAGER' CHECK (status IN ('PENDING_MANAGER','PENDING_HR','APPROVED','REJECTED','CANCELLED')),
  employee_note TEXT,
  manager_note TEXT,
  hr_note TEXT,
  requested_by TEXT,
  manager_reviewed_by TEXT,
  manager_reviewed_at TIMESTAMP(3),
  hr_reviewed_by TEXT,
  hr_reviewed_at TIMESTAMP(3),
  payroll_exported_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (requested_minutes > 0 OR detected_minutes > 0)
);
CREATE INDEX IF NOT EXISTS hr_overtime_scope_status_idx ON hr_overtime_requests(tenant_id,company_id,branch_id,status,work_date);
CREATE INDEX IF NOT EXISTS hr_overtime_staff_date_idx ON hr_overtime_requests(tenant_id,company_id,staff_id,work_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS hr_overtime_attendance_active_uq ON hr_overtime_requests(attendance_record_id) WHERE attendance_record_id IS NOT NULL AND status <> 'CANCELLED';

ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS approved_overtime_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_approved_overtime_minutes_check CHECK (approved_overtime_minutes >= 0);
