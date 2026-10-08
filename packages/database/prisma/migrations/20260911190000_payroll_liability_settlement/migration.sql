BEGIN;

ALTER TABLE salary_payments
  ADD COLUMN IF NOT EXISTS company_id TEXT,
  ADD COLUMN IF NOT EXISTS journal_entry_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_account_code VARCHAR(3);

UPDATE salary_payments sp
SET company_id = pp.company_id
FROM payroll_periods pp
WHERE pp.id = sp.period_id AND sp.company_id IS NULL;

CREATE INDEX IF NOT EXISTS salary_payments_company_period_staff_idx
  ON salary_payments(company_id, period_id, staff_id);

CREATE UNIQUE INDEX IF NOT EXISTS salary_payments_journal_entry_uq
  ON salary_payments(journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payroll_liability_payments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT,
  period_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  method TEXT NOT NULL DEFAULT 'BANK',
  payment_account_code VARCHAR(3) NOT NULL,
  paid_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note TEXT,
  journal_entry_id TEXT NOT NULL,
  created_by_user_id TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payroll_liability_payments_type_chk CHECK (type IN ('TAX','SOCIAL_SECURITY','OTHER')) NOT VALID,
  CONSTRAINT payroll_liability_payments_amount_chk CHECK (amount > 0) NOT VALID,
  CONSTRAINT payroll_liability_payments_payment_account_chk CHECK (payment_account_code IN ('100','102')) NOT VALID
);

CREATE INDEX IF NOT EXISTS payroll_liability_payments_scope_period_idx
  ON payroll_liability_payments(tenant_id, company_id, period_id, type, paid_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS payroll_liability_payments_journal_uq
  ON payroll_liability_payments(journal_entry_id);

ALTER TABLE payroll_liability_payments
  ADD CONSTRAINT payroll_liability_payments_period_fkey
  FOREIGN KEY (period_id) REFERENCES payroll_periods(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE payroll_liability_payments
  ADD CONSTRAINT payroll_liability_payments_journal_fkey
  FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
