CREATE TABLE IF NOT EXISTS hr_onboarding_plans (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT, branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT, staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
 name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ACTIVE', started_at DATE NOT NULL DEFAULT CURRENT_DATE, target_completion_date DATE, completed_at TIMESTAMP(3), created_by TEXT, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT hr_onboarding_plan_status_chk CHECK(status IN ('DRAFT','ACTIVE','COMPLETED','CANCELLED'))
);
CREATE INDEX IF NOT EXISTS hr_onboarding_plans_staff_idx ON hr_onboarding_plans(tenant_id,staff_id,status);
CREATE UNIQUE INDEX IF NOT EXISTS hr_onboarding_active_staff_idx ON hr_onboarding_plans(tenant_id,staff_id) WHERE status='ACTIVE';
CREATE TABLE IF NOT EXISTS hr_onboarding_tasks (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, plan_id TEXT NOT NULL REFERENCES hr_onboarding_plans(id) ON DELETE CASCADE, title TEXT NOT NULL, description TEXT, owner_staff_id TEXT REFERENCES staff(id) ON DELETE SET NULL, due_date DATE, status TEXT NOT NULL DEFAULT 'PENDING', required_document_type TEXT, depends_on_task_id TEXT REFERENCES hr_onboarding_tasks(id) ON DELETE SET NULL, completed_at TIMESTAMP(3), completed_by TEXT, completion_note TEXT, sort_order INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT hr_onboarding_task_status_chk CHECK(status IN ('PENDING','IN_PROGRESS','COMPLETED','SKIPPED','BLOCKED'))
);
CREATE INDEX IF NOT EXISTS hr_onboarding_tasks_plan_idx ON hr_onboarding_tasks(tenant_id,plan_id,sort_order);
