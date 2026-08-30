-- P2-D.1 Customers branch scope
-- Safe progression: keep tenantId, add nullable branchId, backfill, then enforce NOT NULL.
BEGIN;

ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "branchId" TEXT;

ALTER TABLE "customer_health_profiles"
  ADD COLUMN IF NOT EXISTS "branchId" TEXT;

ALTER TABLE "customer_documents"
  ADD COLUMN IF NOT EXISTS "branchId" TEXT;

ALTER TABLE "customer_consents"
  ADD COLUMN IF NOT EXISTS "branchId" TEXT;

ALTER TABLE "customer_care_events"
  ADD COLUMN IF NOT EXISTS "branchId" TEXT;

-- Backfill customers from their tenant's company default/first branch.
UPDATE "customers" c
SET "branchId" = b.id
FROM "companies" co
JOIN "branches" b ON b."companyId" = co.id
WHERE c."tenantId" = co."tenantId"
  AND c."branchId" IS NULL
  AND b.id = (
    SELECT b2.id
    FROM "branches" b2
    WHERE b2."companyId" = co.id
    ORDER BY CASE WHEN b2.code = 'MERKEZ' THEN 0 ELSE 1 END, b2."createdAt" ASC
    LIMIT 1
  );

-- Related customer domain records follow the customer's branch.
UPDATE "customer_health_profiles" hp
SET "branchId" = c."branchId"
FROM "customers" c
WHERE hp."customerId" = c.id
  AND hp."branchId" IS NULL;

UPDATE "customer_documents" d
SET "branchId" = c."branchId"
FROM "customers" c
WHERE d."customerId" = c.id
  AND d."branchId" IS NULL;

UPDATE "customer_consents" cc
SET "branchId" = c."branchId"
FROM "customers" c
WHERE cc."customerId" = c.id
  AND cc."branchId" IS NULL;

UPDATE "customer_care_events" ce
SET "branchId" = c."branchId"
FROM "customers" c
WHERE ce."customerId" = c.id
  AND ce."branchId" IS NULL;

-- Fail closed if any tenant/company/customer cannot be mapped.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "customers" WHERE "branchId" IS NULL) THEN
    RAISE EXCEPTION 'P2-D customer backfill failed: some customers have no branchId';
  END IF;

  IF EXISTS (SELECT 1 FROM "customer_health_profiles" WHERE "branchId" IS NULL) THEN
    RAISE EXCEPTION 'P2-D health-profile backfill failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "customer_consents"
    WHERE "branchId" IS NULL
  ) THEN
    RAISE EXCEPTION 'P2-D consent backfill failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "customer_care_events"
    WHERE "branchId" IS NULL
  ) THEN
    RAISE EXCEPTION 'P2-D care-event backfill failed';
  END IF;
END $$;

ALTER TABLE "customers"
  ALTER COLUMN "branchId" SET NOT NULL;

ALTER TABLE "customer_health_profiles"
  ALTER COLUMN "branchId" SET NOT NULL;

ALTER TABLE "customer_consents"
  ALTER COLUMN "branchId" SET NOT NULL;

ALTER TABLE "customer_care_events"
  ALTER COLUMN "branchId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "customers_tenantId_branchId_idx"
  ON "customers"("tenantId", "branchId");

CREATE INDEX IF NOT EXISTS "customers_branchId_idx"
  ON "customers"("branchId");

CREATE INDEX IF NOT EXISTS "customer_health_profiles_branchId_idx"
  ON "customer_health_profiles"("branchId");

CREATE INDEX IF NOT EXISTS "customer_documents_branchId_idx"
  ON "customer_documents"("branchId");

CREATE INDEX IF NOT EXISTS "customer_consents_branchId_idx"
  ON "customer_consents"("branchId");

CREATE INDEX IF NOT EXISTS "customer_care_events_branchId_idx"
  ON "customer_care_events"("branchId");

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_health_profiles"
  ADD CONSTRAINT "customer_health_profiles_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_documents"
  ADD CONSTRAINT "customer_documents_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_consents"
  ADD CONSTRAINT "customer_consents_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_care_events"
  ADD CONSTRAINT "customer_care_events_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
