-- HR core: personnel and contracts.
-- Attendance, leave, payroll, salary payments and SGK tables are created by
-- 20260831120000_hr_operational_tables. Existing Staff records remain the source employee identity.

CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME','PART_TIME','HOURLY','SEASONAL','INTERN');
CREATE TYPE "SalaryType" AS ENUM ('MONTHLY','DAILY','HOURLY');
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT','ACTIVE','ENDED');
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT','ABSENT','LEAVE','SICK','HOLIDAY','OFF','REMOTE');
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL','EXCUSED','UNPAID','SICK','MATERNITY','PATERNITY','OTHER');
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING','APPROVED','REJECTED','CANCELLED');
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT','CALCULATED','APPROVED','PAID','CANCELLED');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'PaymentStatus'
  ) THEN
    CREATE TYPE "PaymentStatus" AS ENUM ('PENDING','READY','PAID','CANCELLED');
  END IF;
END
$$;

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
