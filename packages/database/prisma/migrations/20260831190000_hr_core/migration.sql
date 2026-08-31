-- HR core: personnel, contracts, attendance, leave, payroll, payments and SGK records.
-- Existing Staff records remain the source employee identity.

CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME','PART_TIME','HOURLY','SEASONAL','INTERN');
CREATE TYPE "SalaryType" AS ENUM ('MONTHLY','DAILY','HOURLY');
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT','ACTIVE','ENDED');
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT','ABSENT','LEAVE','SICK','HOLIDAY','OFF','REMOTE');
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL','EXCUSED','UNPAID','SICK','MATERNITY','PATERNITY','OTHER');
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING','APPROVED','REJECTED','CANCELLED');
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT','CALCULATED','APPROVED','PAID','CANCELLED');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING','READY','PAID','CANCELLED');
CREATE TYPE "SgkRecordType" AS ENUM ('ENTRY','EXIT','MONTHLY');

CREATE TABLE "employee_profiles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "branch_id" TEXT NOT NULL REFERENCES "branches"("id") ON DELETE RESTRICT,
  "staff_id" TEXT NOT NULL UNIQUE REFERENCES "staff"("id") ON DELETE CASCADE,
  "personnel_number" TEXT,
  "identity_number" TEXT,
  "birth_date" TIMESTAMP(3),
  "birth_place" TEXT,
  "gender" TEXT,
  "marital_status" TEXT,
  "nationality" TEXT DEFAULT 'TR',
  "address" TEXT,
  "city" TEXT,
  "district" TEXT,
  "postal_code" TEXT,
  "department" TEXT,
  "position" TEXT,
  "employment_type" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
  "hire_date" TIMESTAMP(3),
  "termination_date" TIMESTAMP(3),
  "iban" TEXT,
  "bank_name" TEXT,
  "emergency_name" TEXT,
  "emergency_relation" TEXT,
  "emergency_phone" TEXT,
  "annual_leave_entitlement" DECIMAL(8,2) NOT NULL DEFAULT 14,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "employee_profiles_tenant_branch_idx" ON "employee_profiles"("tenant_id","branch_id");
CREATE INDEX "employee_profiles_personnel_number_idx" ON "employee_profiles"("tenant_id","personnel_number");

CREATE TABLE "employee_contracts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "branch_id" TEXT NOT NULL REFERENCES "branches"("id") ON DELETE RESTRICT,
  "staff_id" TEXT NOT NULL REFERENCES "staff"("id") ON DELETE CASCADE,
  "start_date" TIMESTAMP(3) NOT NULL,
  "end_date" TIMESTAMP(3),
  "employment_type" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
  "salary_type" "SalaryType" NOT NULL DEFAULT 'MONTHLY',
  "gross_salary" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "weekly_hours" DECIMAL(6,2) NOT NULL DEFAULT 45,
  "status" "ContractStatus" NOT NULL DEFAULT 'ACTIVE',
  "document_url" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "employee_contracts_scope_idx" ON "employee_contracts"("tenant_id","branch_id","staff_id");
CREATE INDEX "employee_contracts_dates_idx" ON "employee_contracts"("staff_id","start_date","end_date");

CREATE TABLE "attendance_records" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "branch_id" TEXT NOT NULL REFERENCES "branches"("id") ON DELETE RESTRICT,
  "staff_id" TEXT NOT NULL REFERENCES "staff"("id") ON DELETE CASCADE,
  "work_date" DATE NOT NULL,
  "check_in" TIMESTAMP(3),
  "check_out" TIMESTAMP(3),
  "break_minutes" INTEGER NOT NULL DEFAULT 0,
  "worked_minutes" INTEGER NOT NULL DEFAULT 0,
  "overtime_minutes" INTEGER NOT NULL DEFAULT 0,
  "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
  "note" TEXT,
  "approved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_records_staff_date_key" UNIQUE ("staff_id","work_date")
);
CREATE INDEX "attendance_records_scope_date_idx" ON "attendance_records"("tenant_id","branch_id","work_date");
CREATE INDEX "attendance_records_staff_date_idx" ON "attendance_records"("staff_id","work_date");

CREATE TABLE "leave_requests" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "branch_id" TEXT NOT NULL REFERENCES "branches"("id") ON DELETE RESTRICT,
  "staff_id" TEXT NOT NULL REFERENCES "staff"("id") ON DELETE CASCADE,
  "type" "LeaveType" NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "days" DECIMAL(8,2) NOT NULL,
  "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "approved_at" TIMESTAMP(3),
  "rejected_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "leave_requests_scope_dates_idx" ON "leave_requests"("tenant_id","branch_id","start_date","end_date");
CREATE INDEX "leave_requests_staff_status_idx" ON "leave_requests"("staff_id","status");

CREATE TABLE "payroll_periods" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" TEXT REFERENCES "companies"("id") ON DELETE SET NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
  "calculated_at" TIMESTAMP(3),
  "approved_at" TIMESTAMP(3),
  "paid_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_periods_tenant_year_month_key" UNIQUE ("tenant_id","year","month")
);

CREATE TABLE "payroll_items" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "branch_id" TEXT NOT NULL REFERENCES "branches"("id") ON DELETE RESTRICT,
  "period_id" UUID NOT NULL REFERENCES "payroll_periods"("id") ON DELETE CASCADE,
  "staff_id" TEXT NOT NULL REFERENCES "staff"("id") ON DELETE CASCADE,
  "gross_salary" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "overtime_pay" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "bonus" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "other_earnings" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "sgk_employee" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "unemployment_employee" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "income_tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "stamp_tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "other_deductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "net_salary" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "employer_sgk" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "employer_unemployment" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "work_days" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "unpaid_days" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "overtime_minutes" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_items_period_staff_key" UNIQUE ("period_id","staff_id")
);
CREATE INDEX "payroll_items_scope_idx" ON "payroll_items"("tenant_id","branch_id","period_id");

CREATE TABLE "salary_payments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "branch_id" TEXT NOT NULL REFERENCES "branches"("id") ON DELETE RESTRICT,
  "period_id" UUID NOT NULL REFERENCES "payroll_periods"("id") ON DELETE CASCADE,
  "staff_id" TEXT NOT NULL REFERENCES "staff"("id") ON DELETE CASCADE,
  "amount" DECIMAL(12,2) NOT NULL,
  "iban" TEXT,
  "bank_name" TEXT,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "payment_date" TIMESTAMP(3),
  "reference" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "salary_payments_period_staff_key" UNIQUE ("period_id","staff_id")
);
CREATE INDEX "salary_payments_scope_idx" ON "salary_payments"("tenant_id","branch_id","status");

CREATE TABLE "sgk_records" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "branch_id" TEXT NOT NULL REFERENCES "branches"("id") ON DELETE RESTRICT,
  "staff_id" TEXT NOT NULL REFERENCES "staff"("id") ON DELETE CASCADE,
  "type" "SgkRecordType" NOT NULL,
  "period_year" INTEGER,
  "period_month" INTEGER,
  "record_date" TIMESTAMP(3) NOT NULL,
  "days" DECIMAL(8,2),
  "prime_earnings" DECIMAL(12,2),
  "document_number" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "sgk_records_scope_period_idx" ON "sgk_records"("tenant_id","branch_id","period_year","period_month");
CREATE INDEX "sgk_records_staff_idx" ON "sgk_records"("staff_id","record_date");
