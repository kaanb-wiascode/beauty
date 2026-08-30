-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BranchStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('CENTRAL', 'COMPANY', 'BRANCH');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "BranchStatus" NOT NULL DEFAULT 'ACTIVE',
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_branch_access" (
    "membershipId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_branch_access_pkey" PRIMARY KEY ("membershipId","branchId")
);

-- AlterTable
ALTER TABLE "memberships"
ADD COLUMN "companyId" TEXT;

-- AlterTable
ALTER TABLE "roles"
ADD COLUMN "companyId" TEXT,
ADD COLUMN "scope" "RoleScope" NOT NULL DEFAULT 'COMPANY';

-- Seed companies: one company per existing tenant.
INSERT INTO "companies" ("id", "tenantId", "name", "slug", "status", "createdAt", "updatedAt")
SELECT
    gen_random_uuid(),
    t."id",
    t."name",
    t."slug",
    'ACTIVE'::"CompanyStatus",
    t."createdAt",
    t."updatedAt"
FROM "tenants" t;

-- Seed a safe default branch for every company.
INSERT INTO "branches" ("id", "companyId", "name", "code", "status", "createdAt", "updatedAt")
SELECT
    gen_random_uuid(),
    c."id",
    'Merkez',
    'MERKEZ',
    'ACTIVE'::"BranchStatus",
    c."createdAt",
    c."updatedAt"
FROM "companies" c;

-- Backfill existing memberships to their tenant's new company.
UPDATE "memberships" m
SET "companyId" = c."id"
FROM "companies" c
WHERE c."tenantId" = m."tenantId";

-- Backfill existing roles to their tenant's new company.
UPDATE "roles" r
SET "companyId" = c."id"
FROM "companies" c
WHERE c."tenantId" = r."tenantId";

-- Preserve current broad access semantics for existing roles.
UPDATE "roles"
SET "scope" = 'CENTRAL'::"RoleScope";

-- Every existing membership gets access to its current tenant's default branch.
INSERT INTO "membership_branch_access" ("membershipId", "branchId")
SELECT
    m."id",
    b."id"
FROM "memberships" m
JOIN "companies" c
  ON c."id" = m."companyId"
JOIN "branches" b
  ON b."companyId" = c."id"
 AND b."code" = 'MERKEZ';

-- CreateIndex
CREATE UNIQUE INDEX "companies_tenantId_slug_key" ON "companies"("tenantId","slug");

-- CreateIndex
CREATE INDEX "companies_tenantId_idx" ON "companies"("tenantId");

-- CreateIndex
CREATE INDEX "companies_tenantId_status_idx" ON "companies"("tenantId","status");

-- CreateIndex
CREATE UNIQUE INDEX "branches_companyId_code_key" ON "branches"("companyId","code");

-- CreateIndex
CREATE INDEX "branches_companyId_idx" ON "branches"("companyId");

-- CreateIndex
CREATE INDEX "branches_companyId_status_idx" ON "branches"("companyId","status");

-- CreateIndex
CREATE INDEX "membership_branch_access_branchId_idx" ON "membership_branch_access"("branchId");

-- CreateIndex
CREATE INDEX "memberships_companyId_idx" ON "memberships"("companyId");

-- CreateIndex
CREATE INDEX "roles_companyId_idx" ON "roles"("companyId");

-- CreateIndex
CREATE INDEX "roles_companyId_scope_idx" ON "roles"("companyId","scope");

-- AddForeignKey
ALTER TABLE "companies"
ADD CONSTRAINT "companies_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches"
ADD CONSTRAINT "branches_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "companies"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_branch_access"
ADD CONSTRAINT "membership_branch_access_membershipId_fkey"
FOREIGN KEY ("membershipId") REFERENCES "memberships"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_branch_access"
ADD CONSTRAINT "membership_branch_access_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "branches"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships"
ADD CONSTRAINT "memberships_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "companies"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles"
ADD CONSTRAINT "roles_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "companies"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
