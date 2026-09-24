ALTER TABLE "staff" ADD COLUMN "userId" TEXT;

ALTER TABLE "staff"
  ADD CONSTRAINT "staff_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "staff_tenantId_userId_key"
  ON "staff"("tenantId","userId")
  WHERE "userId" IS NOT NULL;

CREATE INDEX "staff_userId_idx"
  ON "staff"("userId");

WITH candidates AS (
  SELECT
    s.id AS staff_id,
    u.id AS user_id,
    COUNT(*) OVER (PARTITION BY s."tenantId", u.id) AS match_count
  FROM "staff" s
  JOIN "users" u
    ON s.email IS NOT NULL
   AND lower(s.email) = lower(u.email)
  JOIN "memberships" m
    ON m."userId" = u.id
   AND m."tenantId" = s."tenantId"
   AND m.status = 'ACTIVE'
  WHERE s.status = 'ACTIVE'
)
UPDATE "staff" s
SET "userId" = candidates.user_id
FROM candidates
WHERE s.id = candidates.staff_id
  AND candidates.match_count = 1;
