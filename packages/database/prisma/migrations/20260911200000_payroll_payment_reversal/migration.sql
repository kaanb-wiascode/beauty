BEGIN;

ALTER TABLE salary_payments
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS reversed_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT,
  ADD COLUMN IF NOT EXISTS reversal_journal_entry_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS salary_payments_reversal_journal_uq
  ON salary_payments(reversal_journal_entry_id)
  WHERE reversal_journal_entry_id IS NOT NULL;

ALTER TABLE payroll_liability_payments
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PAID',
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS reversed_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT,
  ADD COLUMN IF NOT EXISTS reversal_journal_entry_id TEXT;

ALTER TABLE payroll_liability_payments
  ADD CONSTRAINT payroll_liability_payments_status_chk
  CHECK (status IN ('PAID','REVERSED')) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS payroll_liability_payments_reversal_journal_uq
  ON payroll_liability_payments(reversal_journal_entry_id)
  WHERE reversal_journal_entry_id IS NOT NULL;

ALTER TABLE salary_payments
  ADD CONSTRAINT salary_payments_reversal_journal_fkey
  FOREIGN KEY (reversal_journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE payroll_liability_payments
  ADD CONSTRAINT payroll_liability_payments_reversal_journal_fkey
  FOREIGN KEY (reversal_journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
