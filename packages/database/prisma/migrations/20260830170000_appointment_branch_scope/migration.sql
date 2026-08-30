-- P2-D.2 Appointment branch scope
-- Safe progression: add nullable branchId, backfill from customer,
-- fail closed if any appointment cannot be mapped, then enforce NOT NULL.

BEGIN;

ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "branchId" TEXT;

-- Existing appointments inherit the customer's current branch.
UPDATE "appointments" a
SET "branchId" = c."branchId"
FROM "customers" c
WHERE a."customerId" = c."id"
  AND a."tenantId" = c."tenantId"
  AND a."branchId" IS NULL;

-- Fail closed: every appointment must belong to a branch.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "appointments"
    WHERE "branchId" IS NULL
  ) THEN
    RAISE EXCEPTION
      'P2-D appointment backfill failed: some appointments have no branchId';
  END IF;
END $$;

ALTER TABLE "appointments"
  ALTER COLUMN "branchId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "appointments_branchId_idx"
  ON "appointments"("branchId");

CREATE INDEX IF NOT EXISTS "appointments_tenantId_branchId_idx"
  ON "appointments"("tenantId", "branchId");

CREATE INDEX IF NOT EXISTS "appointments_tenantId_branchId_startAt_idx"
  ON "appointments"("tenantId", "branchId", "startAt");

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
