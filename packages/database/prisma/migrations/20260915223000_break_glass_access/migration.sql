CREATE TABLE IF NOT EXISTS "break_glass_access_events" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "permissionId" TEXT NOT NULL,
  "branchId" TEXT,
  "temporaryGrantId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "activatedByUserId" TEXT NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "break_glass_access_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "break_glass_access_events_membership_fkey" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "break_glass_access_events_permission_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "break_glass_access_events_branch_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "break_glass_access_events_grant_fkey" FOREIGN KEY ("temporaryGrantId") REFERENCES "temporary_permission_grants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "break_glass_access_events_activated_by_fkey" FOREIGN KEY ("activatedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "break_glass_access_events_revoked_by_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "break_glass_access_events_scope_idx"
  ON "break_glass_access_events" ("tenantId", "companyId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "break_glass_access_events_membership_idx"
  ON "break_glass_access_events" ("membershipId", "endsAt", "revokedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "break_glass_access_events_grant_key"
  ON "break_glass_access_events" ("temporaryGrantId");
