-- HR organization foundation: normalized departments, teams, positions and effective-dated assignments.
-- Existing free-text Staff.profile values are backfilled where possible and remain available for compatibility.

CREATE TABLE "hr_departments" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hr_departments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "hr_departments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "hr_departments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "hr_departments_company_code_key" ON "hr_departments"("company_id","code");
CREATE INDEX "hr_departments_tenant_company_idx" ON "hr_departments"("tenant_id","company_id");

CREATE TABLE "hr_teams" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hr_teams_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "hr_teams_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "hr_teams_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "hr_departments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "hr_teams_department_code_key" ON "hr_teams"("department_id","code");
CREATE INDEX "hr_teams_tenant_department_idx" ON "hr_teams"("tenant_id","department_id");

CREATE TABLE "hr_positions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "department_id" TEXT,
  "parent_position_id" TEXT,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hr_positions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "hr_positions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "hr_positions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "hr_positions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "hr_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "hr_positions_parent_position_id_fkey" FOREIGN KEY ("parent_position_id") REFERENCES "hr_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "hr_positions_company_code_key" ON "hr_positions"("company_id","code");
CREATE INDEX "hr_positions_tenant_company_idx" ON "hr_positions"("tenant_id","company_id");
CREATE INDEX "hr_positions_department_idx" ON "hr_positions"("department_id");

CREATE TABLE "hr_employee_assignments" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "department_id" TEXT,
  "team_id" TEXT,
  "position_id" TEXT,
  "manager_staff_id" TEXT,
  "effective_from" DATE NOT NULL,
  "effective_to" DATE,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hr_employee_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "hr_employee_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "hr_employee_assignments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "hr_employee_assignments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "hr_employee_assignments_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "hr_employee_assignments_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "hr_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "hr_employee_assignments_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "hr_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "hr_employee_assignments_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "hr_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "hr_employee_assignments_manager_staff_id_fkey" FOREIGN KEY ("manager_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "hr_employee_assignments_dates_check" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from")
);
CREATE INDEX "hr_employee_assignments_staff_dates_idx" ON "hr_employee_assignments"("tenant_id","staff_id","effective_from");
CREATE INDEX "hr_employee_assignments_branch_idx" ON "hr_employee_assignments"("tenant_id","branch_id");
CREATE UNIQUE INDEX "hr_employee_assignments_one_current_key" ON "hr_employee_assignments"("staff_id") WHERE "effective_to" IS NULL;

-- Backfill distinct legacy department names per company.
INSERT INTO "hr_departments" ("id","tenant_id","company_id","code","name")
SELECT md5(s."tenantId" || ':' || b."companyId" || ':department:' || lower(btrim(s."profile"->>'department'))),
       s."tenantId", b."companyId",
       'LEGACY-' || substr(md5(lower(btrim(s."profile"->>'department'))),1,12),
       btrim(s."profile"->>'department')
FROM "staff" s
JOIN "branches" b ON b."id"=s."branchId"
WHERE NULLIF(btrim(s."profile"->>'department'),'') IS NOT NULL
GROUP BY s."tenantId",b."companyId",btrim(s."profile"->>'department')
ON CONFLICT ("company_id","code") DO NOTHING;

-- Backfill distinct legacy positions per company and connect them to a department when unambiguous for that staff row.
INSERT INTO "hr_positions" ("id","tenant_id","company_id","department_id","code","name")
SELECT md5(s."tenantId" || ':' || b."companyId" || ':position:' || lower(btrim(s."profile"->>'position'))),
       s."tenantId", b."companyId",
       CASE WHEN NULLIF(btrim(s."profile"->>'department'),'') IS NULL THEN NULL
            ELSE md5(s."tenantId" || ':' || b."companyId" || ':department:' || lower(btrim(s."profile"->>'department'))) END,
       'LEGACY-' || substr(md5(lower(btrim(s."profile"->>'position'))),1,12),
       btrim(s."profile"->>'position')
FROM "staff" s
JOIN "branches" b ON b."id"=s."branchId"
WHERE NULLIF(btrim(s."profile"->>'position'),'') IS NOT NULL
GROUP BY s."tenantId",b."companyId",btrim(s."profile"->>'position'),btrim(s."profile"->>'department')
ON CONFLICT ("company_id","code") DO NOTHING;

INSERT INTO "hr_employee_assignments" (
  "id","tenant_id","company_id","branch_id","staff_id","department_id","position_id","effective_from","reason"
)
SELECT md5(s."tenantId" || ':assignment:' || s."id"),
       s."tenantId",b."companyId",s."branchId",s."id",
       CASE WHEN NULLIF(btrim(s."profile"->>'department'),'') IS NULL THEN NULL
            ELSE md5(s."tenantId" || ':' || b."companyId" || ':department:' || lower(btrim(s."profile"->>'department'))) END,
       CASE WHEN NULLIF(btrim(s."profile"->>'position'),'') IS NULL THEN NULL
            ELSE md5(s."tenantId" || ':' || b."companyId" || ':position:' || lower(btrim(s."profile"->>'position'))) END,
       COALESCE(emr."hire_date",s."createdAt"::date),
       'LEGACY_PROFILE_BACKFILL'
FROM "staff" s
JOIN "branches" b ON b."id"=s."branchId"
LEFT JOIN "employee_master_records" emr ON emr."staff_id"=s."id"
ON CONFLICT ("staff_id") WHERE "effective_to" IS NULL DO NOTHING;
