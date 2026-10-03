CREATE TABLE IF NOT EXISTS hr_shift_templates (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
 code TEXT NOT NULL,
 name TEXT NOT NULL,
 start_time TIME NOT NULL,
 end_time TIME NOT NULL,
 break_minutes INTEGER NOT NULL DEFAULT 0 CHECK (break_minutes >= 0 AND break_minutes <= 720),
 crosses_midnight BOOLEAN NOT NULL DEFAULT FALSE,
 role_requirement TEXT,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_by TEXT,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (length(trim(code)) > 0), CHECK (length(trim(name)) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS hr_shift_templates_scope_code_uq ON hr_shift_templates(tenant_id,company_id,COALESCE(branch_id,''),code);
CREATE INDEX IF NOT EXISTS hr_shift_templates_scope_idx ON hr_shift_templates(tenant_id,company_id,branch_id,active);

CREATE TABLE IF NOT EXISTS hr_scheduled_shifts (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
 template_id TEXT REFERENCES hr_shift_templates(id) ON DELETE SET NULL,
 shift_date DATE NOT NULL,
 starts_at TIMESTAMP(3) NOT NULL,
 ends_at TIMESTAMP(3) NOT NULL,
 break_minutes INTEGER NOT NULL DEFAULT 0 CHECK (break_minutes >= 0 AND break_minutes <= 720),
 status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','CANCELLED','COMPLETED')),
 open_slots INTEGER NOT NULL DEFAULT 0 CHECK (open_slots >= 0),
 role_requirement TEXT,
 notes TEXT,
 published_at TIMESTAMP(3),
 published_by TEXT,
 created_by TEXT,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS hr_scheduled_shifts_calendar_idx ON hr_scheduled_shifts(tenant_id,company_id,branch_id,shift_date,status);

CREATE TABLE IF NOT EXISTS hr_shift_assignments (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
 scheduled_shift_id TEXT NOT NULL REFERENCES hr_scheduled_shifts(id) ON DELETE CASCADE,
 staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED','CONFIRMED','DECLINED','CANCELLED','COMPLETED')),
 source TEXT NOT NULL DEFAULT 'MANAGER' CHECK (source IN ('MANAGER','RECURRING','OPEN_SHIFT','SHIFT_SWAP','SYSTEM')),
 assigned_by TEXT,
 assigned_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 confirmed_at TIMESTAMP(3),
 notes TEXT,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS hr_shift_assignment_staff_uq ON hr_shift_assignments(tenant_id,scheduled_shift_id,staff_id) WHERE status <> 'CANCELLED';
CREATE INDEX IF NOT EXISTS hr_shift_assignment_staff_calendar_idx ON hr_shift_assignments(tenant_id,company_id,staff_id,status);

CREATE TABLE IF NOT EXISTS hr_shift_service_requirements (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 scheduled_shift_id TEXT NOT NULL REFERENCES hr_scheduled_shifts(id) ON DELETE CASCADE,
 service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
 minimum_staff INTEGER NOT NULL DEFAULT 1 CHECK (minimum_staff > 0),
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS hr_shift_service_requirement_uq ON hr_shift_service_requirements(tenant_id,company_id,scheduled_shift_id,service_id);

CREATE TABLE IF NOT EXISTS hr_shift_recurrence_rules (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
 template_id TEXT NOT NULL REFERENCES hr_shift_templates(id) ON DELETE CASCADE,
 weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
 effective_from DATE NOT NULL,
 effective_to DATE,
 required_staff INTEGER NOT NULL DEFAULT 1 CHECK (required_staff > 0),
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_by TEXT,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX IF NOT EXISTS hr_shift_recurrence_active_idx ON hr_shift_recurrence_rules(tenant_id,company_id,branch_id,active,effective_from,effective_to);
