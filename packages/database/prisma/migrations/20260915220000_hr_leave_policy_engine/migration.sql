-- HR leave policy, entitlement and ledger foundation.
BEGIN;

CREATE TABLE IF NOT EXISTS hr_leave_types (
 id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 code TEXT NOT NULL,
 name TEXT NOT NULL,
 paid BOOLEAN NOT NULL DEFAULT TRUE,
 requires_document BOOLEAN NOT NULL DEFAULT FALSE,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,company_id,code)
);

CREATE TABLE IF NOT EXISTS hr_leave_policies (
 id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 leave_type_id TEXT NOT NULL REFERENCES hr_leave_types(id) ON DELETE RESTRICT,
 name TEXT NOT NULL,
 employment_type TEXT,
 position_id TEXT REFERENCES hr_positions(id) ON DELETE SET NULL,
 branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
 annual_entitlement DECIMAL(8,2) NOT NULL DEFAULT 0 CHECK(annual_entitlement>=0),
 accrual_method TEXT NOT NULL DEFAULT 'ANNUAL' CHECK(accrual_method IN('ANNUAL','MONTHLY','NONE')),
 accrual_amount DECIMAL(8,4) NOT NULL DEFAULT 0 CHECK(accrual_amount>=0),
 carry_over_limit DECIMAL(8,2) CHECK(carry_over_limit IS NULL OR carry_over_limit>=0),
 allow_negative BOOLEAN NOT NULL DEFAULT FALSE,
 max_negative DECIMAL(8,2) NOT NULL DEFAULT 0 CHECK(max_negative>=0),
 effective_from DATE NOT NULL,
 effective_to DATE,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(effective_to IS NULL OR effective_to>=effective_from)
);
CREATE INDEX IF NOT EXISTS hr_leave_policies_scope_idx ON hr_leave_policies(tenant_id,company_id,branch_id,leave_type_id,effective_from);

CREATE TABLE IF NOT EXISTS hr_leave_entitlements (
 id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
 staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
 leave_type_id TEXT NOT NULL REFERENCES hr_leave_types(id) ON DELETE RESTRICT,
 policy_id TEXT REFERENCES hr_leave_policies(id) ON DELETE SET NULL,
 period_year INTEGER NOT NULL CHECK(period_year BETWEEN 2000 AND 2200),
 opening_balance DECIMAL(8,2) NOT NULL DEFAULT 0,
 entitled DECIMAL(8,2) NOT NULL DEFAULT 0,
 accrued DECIMAL(8,2) NOT NULL DEFAULT 0,
 carried_over DECIMAL(8,2) NOT NULL DEFAULT 0,
 adjusted DECIMAL(8,2) NOT NULL DEFAULT 0,
 used DECIMAL(8,2) NOT NULL DEFAULT 0,
 pending DECIMAL(8,2) NOT NULL DEFAULT 0,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,staff_id,leave_type_id,period_year)
);
CREATE INDEX IF NOT EXISTS hr_leave_entitlements_scope_idx ON hr_leave_entitlements(tenant_id,company_id,branch_id,staff_id,period_year);

CREATE TABLE IF NOT EXISTS hr_leave_ledger (
 id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
 staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
 leave_type_id TEXT NOT NULL REFERENCES hr_leave_types(id) ON DELETE RESTRICT,
 entitlement_id TEXT REFERENCES hr_leave_entitlements(id) ON DELETE SET NULL,
 leave_request_id TEXT REFERENCES leave_requests(id) ON DELETE SET NULL,
 entry_type TEXT NOT NULL CHECK(entry_type IN('OPENING','ENTITLEMENT','ACCRUAL','CARRY_OVER','REQUEST_PENDING','REQUEST_RELEASE','USAGE','ADJUSTMENT','EXPIRY')),
 quantity DECIMAL(8,2) NOT NULL,
 effective_date DATE NOT NULL,
 reason TEXT,
 actor_id TEXT,
 idempotency_key TEXT,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS hr_leave_ledger_idempotency_key ON hr_leave_ledger(tenant_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS hr_leave_ledger_staff_date_idx ON hr_leave_ledger(tenant_id,staff_id,leave_type_id,effective_date);

ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS leave_type_id TEXT REFERENCES hr_leave_types(id) ON DELETE RESTRICT;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS policy_id TEXT REFERENCES hr_leave_policies(id) ON DELETE SET NULL;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS entitlement_id TEXT REFERENCES hr_leave_entitlements(id) ON DELETE SET NULL;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS approval_note TEXT;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP(3);

-- Preserve legacy request types while introducing normalized leave types.
INSERT INTO hr_leave_types(id,tenant_id,company_id,code,name)
SELECT gen_random_uuid()::text,t.id,c.id,x.code,x.name
FROM tenants t JOIN companies c ON c."tenantId"=t.id
CROSS JOIN (VALUES ('ANNUAL','Annual Leave'),('SICK','Sick Leave'),('UNPAID','Unpaid Leave'),('MATERNITY','Maternity Leave'),('PATERNITY','Paternity Leave'),('COMPASSIONATE','Compassionate Leave')) x(code,name)
ON CONFLICT(tenant_id,company_id,code) DO NOTHING;

UPDATE leave_requests lr SET leave_type_id=lt.id
FROM branches b JOIN companies c ON c.id=b."companyId" JOIN hr_leave_types lt ON lt.tenant_id=c."tenantId" AND lt.company_id=c.id
WHERE lr.branch_id=b.id AND lr.leave_type_id IS NULL AND lt.code=UPPER(COALESCE(lr.leave_type,lr.type,'ANNUAL'));

COMMIT;
