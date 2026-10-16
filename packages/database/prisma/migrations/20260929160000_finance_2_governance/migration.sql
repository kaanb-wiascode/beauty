DO $$ BEGIN
  CREATE TYPE "FinancialPeriodStatus" AS ENUM ('OPEN','CLOSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS financial_periods (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT,
  name TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status "FinancialPeriodStatus" NOT NULL DEFAULT 'OPEN',
  closed_by TEXT,
  closed_at TIMESTAMPTZ,
  reopened_by TEXT,
  reopened_at TIMESTAMPTZ,
  close_reason TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT financial_periods_dates_check CHECK (starts_at <= ends_at)
);

CREATE INDEX IF NOT EXISTS financial_periods_scope_dates_idx
  ON financial_periods(tenant_id, company_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS financial_periods_company_branch_status_idx
  ON financial_periods(company_id, branch_id, status);

DO $$ BEGIN
  ALTER TYPE "JournalEntryStatus" ADD VALUE 'SUBMITTED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE "JournalEntryStatus" ADD VALUE 'APPROVED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS "submittedBy" TEXT;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMPTZ;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS "approvedBy" TEXT;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMPTZ;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS "postedBy" TEXT;
