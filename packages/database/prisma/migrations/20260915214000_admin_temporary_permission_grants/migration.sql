CREATE TABLE IF NOT EXISTS "temporary_permission_grants" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "permissionId" TEXT NOT NULL,
  "branchId" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "grantedByUserId" TEXT NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "temporary_permission_grants_valid_window" CHECK ("endsAt" > "startsAt"),
  CONSTRAINT "temporary_permission_grants_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "temporary_permission_grants_company_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "temporary_permission_grants_membership_fkey" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE CASCADE,
  CONSTRAINT "temporary_permission_grants_permission_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE,
  CONSTRAINT "temporary_permission_grants_branch_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE,
  CONSTRAINT "temporary_permission_grants_granted_by_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "temporary_permission_grants_revoked_by_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "temporary_permission_grants_scope_idx"
  ON "temporary_permission_grants" ("tenantId", "companyId", "membershipId");
CREATE INDEX IF NOT EXISTS "temporary_permission_grants_active_idx"
  ON "temporary_permission_grants" ("membershipId", "startsAt", "endsAt")
  WHERE "revokedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "temporary_permission_grants_permission_idx"
  ON "temporary_permission_grants" ("permissionId");
CREATE INDEX IF NOT EXISTS "temporary_permission_grants_branch_idx"
  ON "temporary_permission_grants" ("branchId")
  WHERE "branchId" IS NOT NULL;
