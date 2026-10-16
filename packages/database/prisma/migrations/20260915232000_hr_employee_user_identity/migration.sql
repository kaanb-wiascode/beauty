BEGIN;
CREATE TABLE hr_employee_user_links (
 id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 linked_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 linked_by TEXT,
 UNIQUE(tenant_id,staff_id),
 UNIQUE(tenant_id,user_id)
);
CREATE INDEX hr_employee_user_links_company_idx ON hr_employee_user_links(tenant_id,company_id,active);
COMMIT;
