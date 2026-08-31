-- P2-E HR operational tables
-- Keeps HR records tenant/branch scoped and supports the existing HR API.

BEGIN;

CREATE TABLE IF NOT EXISTS "attendance_records" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "work_date" DATE NOT NULL,
  "check_in" TIMESTAMP(3),
  "check_out" TIMESTAMP(3),
  "break_minutes" INTEGER NOT NULL DEFAULT 0,
  "worked_minutes" INTEGER NOT NULL DEFAULT 0,
  "overtime_minutes" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'PRESENT',
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_records_staff_work_date_key"
  ON "attendance_records"("staff_id", "work_date");
CREATE INDEX IF NOT EXISTS "attendance_records_tenant_branch_date_idx"
  ON "attendance_records"("tenant_id", "branch_id", "work_date");
CREATE INDEX IF NOT EXISTS "attendance_records_staff_date_idx"
  ON "attendance_records"("staff_id", "work_date");

CREATE TABLE IF NOT EXISTS "leave_requests" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "days" DECIMAL(8,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "leave_requests_tenant_branch_start_idx"
  ON "leave_requests"("tenant_id", "branch_id", "start_date");
CREATE INDEX IF NOT EXISTS "leave_requests_staff_start_idx"
  ON "leave_requests"("staff_id", "start_date");
CREATE INDEX IF NOT EXISTS "leave_requests_status_idx"
  ON "leave_requests"("tenant_id", "status");

CREATE TABLE IF NOT EXISTS "payroll_periods" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payroll_periods_tenant_year_month_key"
  ON "payroll_periods"("tenant_id", "year", "month");

CREATE TABLE IF NOT EXISTS "payroll_items" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "period_id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "gross_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "net_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "deductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "employer_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payroll_items_period_staff_key"
  ON "payroll_items"("period_id", "staff_id");
CREATE INDEX IF NOT EXISTS "payroll_items_tenant_branch_idx"
  ON "payroll_items"("tenant_id", "branch_id");

CREATE TABLE IF NOT EXISTS "salary_payments" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "period_id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "method" TEXT NOT NULL DEFAULT 'BANK',
  "status" TEXT NOT NULL DEFAULT 'PAID',
  "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "salary_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "salary_payments_tenant_branch_paid_idx"
  ON "salary_payments"("tenant_id", "branch_id", "paid_at");
CREATE INDEX IF NOT EXISTS "salary_payments_period_staff_idx"
  ON "salary_payments"("period_id", "staff_id");

CREATE TABLE IF NOT EXISTS "sgk_records" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "period_year" INTEGER NOT NULL,
  "period_month" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "document_no" TEXT,
  "record_date" DATE NOT NULL DEFAULT CURRENT_DATE,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sgk_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "sgk_records_tenant_branch_period_idx"
  ON "sgk_records"("tenant_id", "branch_id", "period_year", "period_month");
CREATE INDEX IF NOT EXISTS "sgk_records_staff_period_idx"
  ON "sgk_records"("staff_id", "period_year", "period_month");

-- Referential integrity. These are intentionally added only when the parent
-- tables already exist in the migration chain.
ALTER TABLE "attendance_records"
  ADD CONSTRAINT "attendance_records_tenant_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_records"
  ADD CONSTRAINT "attendance_records_branch_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_records"
  ADD CONSTRAINT "attendance_records_staff_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "leave_requests"
  ADD CONSTRAINT "leave_requests_tenant_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leave_requests"
  ADD CONSTRAINT "leave_requests_branch_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_requests"
  ADD CONSTRAINT "leave_requests_staff_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payroll_periods"
  ADD CONSTRAINT "payroll_periods_tenant_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payroll_items"
  ADD CONSTRAINT "payroll_items_tenant_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_items"
  ADD CONSTRAINT "payroll_items_branch_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_items"
  ADD CONSTRAINT "payroll_items_period_fkey"
  FOREIGN KEY ("period_id") REFERENCES "payroll_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_items"
  ADD CONSTRAINT "payroll_items_staff_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "salary_payments"
  ADD CONSTRAINT "salary_payments_tenant_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "salary_payments"
  ADD CONSTRAINT "salary_payments_branch_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "salary_payments"
  ADD CONSTRAINT "salary_payments_period_fkey"
  FOREIGN KEY ("period_id") REFERENCES "payroll_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "salary_payments"
  ADD CONSTRAINT "salary_payments_staff_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sgk_records"
  ADD CONSTRAINT "sgk_records_tenant_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sgk_records"
  ADD CONSTRAINT "sgk_records_branch_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sgk_records"
  ADD CONSTRAINT "sgk_records_staff_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
