BEGIN;

ALTER TABLE payroll_periods
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT,
  ADD COLUMN IF NOT EXISTS reversal_journal_entry_id TEXT;

CREATE INDEX IF NOT EXISTS payroll_periods_reversed_idx
  ON payroll_periods(tenant_id, company_id, reversed_at)
  WHERE reversed_at IS NOT NULL;

ALTER TABLE payroll_periods
  ADD CONSTRAINT payroll_periods_cancelled_by_user_fkey
  FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE payroll_periods
  ADD CONSTRAINT payroll_periods_reversed_by_user_fkey
  FOREIGN KEY (reversed_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE payroll_periods
  ADD CONSTRAINT payroll_periods_reversal_journal_fkey
  FOREIGN KEY (reversal_journal_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
