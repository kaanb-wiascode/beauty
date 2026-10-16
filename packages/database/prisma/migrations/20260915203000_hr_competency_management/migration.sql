CREATE TABLE IF NOT EXISTS hr_competencies (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 code TEXT NOT NULL,
 name TEXT NOT NULL,
 description TEXT,
 category TEXT,
 max_level INTEGER NOT NULL DEFAULT 5 CHECK (max_level BETWEEN 1 AND 10),
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_by TEXT,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (length(trim(code)) > 0), CHECK (length(trim(name)) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS hr_competencies_company_code_uq ON hr_competencies(tenant_id,company_id,code);
CREATE INDEX IF NOT EXISTS hr_competencies_active_idx ON hr_competencies(tenant_id,company_id,active,category);

CREATE TABLE IF NOT EXISTS hr_position_competency_requirements (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 position_id TEXT NOT NULL REFERENCES hr_positions(id) ON DELETE CASCADE,
 competency_id TEXT NOT NULL REFERENCES hr_competencies(id) ON DELETE CASCADE,
 required_level INTEGER NOT NULL CHECK (required_level BETWEEN 1 AND 10),
 mandatory BOOLEAN NOT NULL DEFAULT TRUE,
 weight NUMERIC(5,2) NOT NULL DEFAULT 1 CHECK (weight > 0),
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS hr_position_competency_requirement_uq ON hr_position_competency_requirements(tenant_id,company_id,position_id,competency_id);
CREATE INDEX IF NOT EXISTS hr_position_competency_position_idx ON hr_position_competency_requirements(tenant_id,company_id,position_id);

CREATE TABLE IF NOT EXISTS hr_employee_competency_assessments (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
 staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
 competency_id TEXT NOT NULL REFERENCES hr_competencies(id) ON DELETE CASCADE,
 level INTEGER NOT NULL CHECK (level BETWEEN 0 AND 10),
 assessment_type TEXT NOT NULL DEFAULT 'MANAGER' CHECK (assessment_type IN ('SELF','MANAGER','PEER','SYSTEM','CERTIFICATION')),
 assessed_at DATE NOT NULL DEFAULT CURRENT_DATE,
 assessed_by TEXT,
 evidence TEXT,
 notes TEXT,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS hr_employee_competency_staff_idx ON hr_employee_competency_assessments(tenant_id,company_id,staff_id,competency_id,assessed_at DESC);
CREATE INDEX IF NOT EXISTS hr_employee_competency_branch_idx ON hr_employee_competency_assessments(tenant_id,company_id,branch_id,assessed_at DESC);

CREATE TABLE IF NOT EXISTS hr_competency_development_actions (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
 staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
 competency_id TEXT NOT NULL REFERENCES hr_competencies(id) ON DELETE CASCADE,
 target_level INTEGER NOT NULL CHECK (target_level BETWEEN 1 AND 10),
 action_type TEXT NOT NULL CHECK (action_type IN ('TRAINING','COACHING','MENTORING','PRACTICE','CERTIFICATION','OTHER')),
 title TEXT NOT NULL,
 due_date DATE,
 status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED')),
 source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','SKILL_GAP','PERFORMANCE','CERTIFICATION')),
 notes TEXT,
 created_by TEXT,
 completed_at TIMESTAMP(3),
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS hr_competency_development_staff_idx ON hr_competency_development_actions(tenant_id,company_id,staff_id,status,due_date);
