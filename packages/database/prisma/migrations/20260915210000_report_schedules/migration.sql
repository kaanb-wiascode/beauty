CREATE TABLE report_schedules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT,
  owner_id TEXT NOT NULL,
  membership_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  role_scope TEXT NOT NULL,
  name TEXT NOT NULL,
  report_key TEXT NOT NULL,
  frequency TEXT NOT NULL,
  timezone TEXT NOT NULL,
  local_hour INTEGER NOT NULL,
  local_minute INTEGER NOT NULL,
  day_of_week INTEGER,
  day_of_month INTEGER,
  format TEXT NOT NULL,
  filters JSONB NOT NULL,
  columns JSONB NOT NULL,
  sort JSONB,
  include_summary BOOLEAN NOT NULL DEFAULT TRUE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  last_export_job_id TEXT,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT report_schedules_role_scope_chk CHECK (role_scope IN ('CENTRAL','COMPANY','BRANCH')),
  CONSTRAINT report_schedules_frequency_chk CHECK (frequency IN ('DAILY','WEEKLY','MONTHLY')),
  CONSTRAINT report_schedules_format_chk CHECK (format IN ('CSV','XLSX','PDF')),
  CONSTRAINT report_schedules_hour_chk CHECK (local_hour BETWEEN 0 AND 23),
  CONSTRAINT report_schedules_minute_chk CHECK (local_minute BETWEEN 0 AND 59),
  CONSTRAINT report_schedules_weekday_chk CHECK (day_of_week IS NULL OR day_of_week BETWEEN 1 AND 7),
  CONSTRAINT report_schedules_monthday_chk CHECK (day_of_month IS NULL OR day_of_month BETWEEN 1 AND 28),
  CONSTRAINT report_schedules_frequency_shape_chk CHECK (
    (frequency = 'DAILY' AND day_of_week IS NULL AND day_of_month IS NULL)
    OR (frequency = 'WEEKLY' AND day_of_week IS NOT NULL AND day_of_month IS NULL)
    OR (frequency = 'MONTHLY' AND day_of_week IS NULL AND day_of_month IS NOT NULL)
  )
);

CREATE INDEX report_schedules_owner_idx
  ON report_schedules (tenant_id, company_id, owner_id, updated_at DESC);
CREATE INDEX report_schedules_due_idx
  ON report_schedules (enabled, next_run_at)
  WHERE enabled = TRUE AND next_run_at IS NOT NULL;
CREATE INDEX report_schedules_report_idx
  ON report_schedules (tenant_id, company_id, report_key);
