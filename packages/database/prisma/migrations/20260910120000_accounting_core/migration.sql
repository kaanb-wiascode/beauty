CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
CREATE TYPE "JournalEntryStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

CREATE TABLE "chart_of_accounts" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "parentId" TEXT,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "AccountType" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "journal_entries" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "branchId" TEXT,
  "number" TEXT NOT NULL,
  "status" "JournalEntryStatus" NOT NULL DEFAULT 'DRAFT',
  "entryDate" TIMESTAMP(3) NOT NULL,
  "description" TEXT NOT NULL,
  "referenceType" TEXT,
  "referenceId" TEXT,
  "postedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "journal_entry_lines" (
  "id" TEXT NOT NULL,
  "journalEntryId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "debit" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "credit" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "memo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "journal_entry_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chart_of_accounts_companyId_code_key" ON "chart_of_accounts"("companyId", "code");
CREATE INDEX "chart_of_accounts_tenantId_companyId_type_idx" ON "chart_of_accounts"("tenantId", "companyId", "type");
CREATE INDEX "chart_of_accounts_parentId_idx" ON "chart_of_accounts"("parentId");
CREATE UNIQUE INDEX "journal_entries_companyId_number_key" ON "journal_entries"("companyId", "number");
CREATE UNIQUE INDEX "journal_entries_company_reference_key"
  ON "journal_entries"("companyId", "referenceType", "referenceId")
  WHERE "referenceType" IS NOT NULL AND "referenceId" IS NOT NULL;
CREATE INDEX "journal_entries_tenantId_companyId_entryDate_idx" ON "journal_entries"("tenantId", "companyId", "entryDate");
CREATE INDEX "journal_entries_branchId_entryDate_idx" ON "journal_entries"("branchId", "entryDate");
CREATE INDEX "journal_entries_tenantId_status_idx" ON "journal_entries"("tenantId", "status");
CREATE INDEX "journal_entry_lines_journalEntryId_idx" ON "journal_entry_lines"("journalEntryId");
CREATE INDEX "journal_entry_lines_accountId_idx" ON "journal_entry_lines"("accountId");

ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_journalEntryId_fkey"
  FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_amounts_nonnegative_check"
  CHECK ("debit" >= 0 AND "credit" >= 0);
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_one_side_only_check"
  CHECK (("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0));
