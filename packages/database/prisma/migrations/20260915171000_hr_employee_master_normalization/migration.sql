-- Normalize critical employee master data that previously lived only in Staff.profile JSON.
-- The legacy profile is intentionally left untouched so existing deployments can roll forward safely;
-- application reads prefer this table and only fall back to profile for pre-migration data.

CREATE TABLE "employee_master_records" (
    "staff_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "employee_number" TEXT,
    "national_identity_number" TEXT,
    "date_of_birth" DATE,
    "personal_email" TEXT,
    "address" TEXT,
    "employment_type" TEXT,
    "hire_date" DATE,
    "termination_date" DATE,
    "bank_name" TEXT,
    "iban" TEXT,
    "gross_salary" DECIMAL(14,2),
    "salary_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_master_records_pkey" PRIMARY KEY ("staff_id"),
    CONSTRAINT "employee_master_records_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "employee_master_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "employee_master_records_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "employee_master_records_tenant_id_idx" ON "employee_master_records"("tenant_id");
CREATE INDEX "employee_master_records_branch_id_idx" ON "employee_master_records"("branch_id");
CREATE INDEX "employee_master_records_tenant_branch_idx" ON "employee_master_records"("tenant_id", "branch_id");
CREATE INDEX "employee_master_records_employment_type_idx" ON "employee_master_records"("tenant_id", "employment_type");
CREATE INDEX "employee_master_records_hire_date_idx" ON "employee_master_records"("tenant_id", "hire_date");
CREATE UNIQUE INDEX "employee_master_records_employee_number_key" ON "employee_master_records"("tenant_id", "employee_number") WHERE "employee_number" IS NOT NULL;
CREATE UNIQUE INDEX "employee_master_records_identity_number_key" ON "employee_master_records"("tenant_id", "national_identity_number") WHERE "national_identity_number" IS NOT NULL;

INSERT INTO "employee_master_records" (
    "staff_id",
    "tenant_id",
    "branch_id",
    "employee_number",
    "national_identity_number",
    "date_of_birth",
    "personal_email",
    "address",
    "employment_type",
    "hire_date",
    "termination_date",
    "bank_name",
    "iban",
    "gross_salary",
    "salary_type"
)
SELECT
    s."id",
    s."tenantId",
    s."branchId",
    NULLIF(BTRIM(s."profile"->>'personnelNumber'), ''),
    NULLIF(BTRIM(s."profile"->>'identityNumber'), ''),
    CASE
        WHEN (s."profile"->>'dateOfBirth') ~ '^\d{4}-\d{2}-\d{2}' THEN LEFT(s."profile"->>'dateOfBirth', 10)::date
        ELSE NULL
    END,
    NULLIF(BTRIM(s."profile"->>'personalEmail'), ''),
    NULLIF(BTRIM(s."profile"->>'address'), ''),
    NULLIF(BTRIM(s."profile"->>'employmentType'), ''),
    CASE
        WHEN (s."profile"->>'hireDate') ~ '^\d{4}-\d{2}-\d{2}' THEN LEFT(s."profile"->>'hireDate', 10)::date
        ELSE NULL
    END,
    CASE
        WHEN (s."profile"->>'terminationDate') ~ '^\d{4}-\d{2}-\d{2}' THEN LEFT(s."profile"->>'terminationDate', 10)::date
        ELSE NULL
    END,
    NULLIF(BTRIM(s."profile"->>'bankName'), ''),
    NULLIF(BTRIM(s."profile"->>'iban'), ''),
    CASE
        WHEN REPLACE(COALESCE(s."profile"->>'salary', ''), ',', '.') ~ '^-?\d+(\.\d+)?$'
            THEN REPLACE(s."profile"->>'salary', ',', '.')::DECIMAL(14,2)
        ELSE NULL
    END,
    NULLIF(BTRIM(s."profile"->>'salaryType'), '')
FROM "staff" s
WHERE s."profile" IS NOT NULL
ON CONFLICT ("staff_id") DO NOTHING;
