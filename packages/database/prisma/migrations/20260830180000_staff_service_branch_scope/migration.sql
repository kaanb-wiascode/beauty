-- P2-D.2 Staff + Service branch scope
-- Safe progression:
-- 1. Add nullable branchId
-- 2. Backfill every existing record to its company's MERKEZ branch
-- 3. Fail closed if anything cannot be mapped
-- 4. Enforce NOT NULL
-- 5. Add indexes and foreign keys

BEGIN;

ALTER TABLE "staff"
  ADD COLUMN IF NOT EXISTS "branchId" TEXT;

ALTER TABLE "services"
  ADD COLUMN IF NOT EXISTS "branchId" TEXT;

-- Backfill staff to the tenant/company MERKEZ branch.
UPDATE "staff" s
SET "branchId" = b.id
FROM "companies" co
JOIN "branches" b
  ON b."companyId" = co.id
WHERE s."tenantId" = co."tenantId"
  AND s."branchId" IS NULL
  AND b."code" = 'MERKEZ';

-- Backfill services to the tenant/company MERKEZ branch.
UPDATE "services" s
SET "branchId" = b.id
FROM "companies" co
JOIN "branches" b
  ON b."companyId" = co.id
WHERE s."tenantId" = co."tenantId"
  AND s."branchId" IS NULL
  AND b."code" = 'MERKEZ';

-- Fail closed if any existing record could not be mapped.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "staff"
    WHERE "branchId" IS NULL
  ) THEN
    RAISE EXCEPTION
      'P2-D staff backfill failed: some staff records have no branchId';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "services"
    WHERE "branchId" IS NULL
  ) THEN
    RAISE EXCEPTION
      'P2-D service backfill failed: some service records have no branchId';
  END IF;
END $$;

ALTER TABLE "staff"
  ALTER COLUMN "branchId" SET NOT NULL;

ALTER TABLE "services"
  ALTER COLUMN "branchId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "staff_branchId_idx"
  ON "staff"("branchId");

CREATE INDEX IF NOT EXISTS "staff_tenantId_branchId_idx"
  ON "staff"("tenantId", "branchId");

CREATE INDEX IF NOT EXISTS "services_branchId_idx"
  ON "services"("branchId");

CREATE INDEX IF NOT EXISTS "services_tenantId_branchId_idx"
  ON "services"("tenantId", "branchId");

ALTER TABLE "staff"
  ADD CONSTRAINT "staff_branchId_fkey"
  FOREIGN KEY ("branchId")
  REFERENCES "branches"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "services"
  ADD CONSTRAINT "services_branchId_fkey"
  FOREIGN KEY ("branchId")
  REFERENCES "branches"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

COMMIT;
