CREATE TABLE IF NOT EXISTS hr_workforce_schedules (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
 week_start DATE NOT NULL,
 version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
 status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','PUBLISHED','CANCELLED')),
 submitted_at TIMESTAMP(3),
 submitted_by TEXT,
 approved_at TIMESTAMP(3),
 approved_by TEXT,
 published_at TIMESTAMP(3),
 published_by TEXT,
 notes TEXT,
 created_by TEXT,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_workforce_schedule_version_uq
 ON hr_workforce_schedules(tenant_id,company_id,branch_id,week_start,version);
CREATE UNIQUE INDEX IF NOT EXISTS hr_workforce_schedule_active_week_uq
 ON hr_workforce_schedules(tenant_id,company_id,branch_id,week_start)
 WHERE status <> 'CANCELLED';
CREATE INDEX IF NOT EXISTS hr_workforce_schedule_scope_idx
 ON hr_workforce_schedules(tenant_id,company_id,branch_id,week_start,status);

ALTER TABLE hr_scheduled_shifts ADD COLUMN IF NOT EXISTS workforce_schedule_id TEXT;
ALTER TABLE hr_scheduled_shifts ADD CONSTRAINT hr_scheduled_shifts_workforce_schedule_fk
 FOREIGN KEY (workforce_schedule_id) REFERENCES hr_workforce_schedules(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS hr_scheduled_shifts_workforce_schedule_idx
 ON hr_scheduled_shifts(tenant_id,company_id,workforce_schedule_id,shift_date);
