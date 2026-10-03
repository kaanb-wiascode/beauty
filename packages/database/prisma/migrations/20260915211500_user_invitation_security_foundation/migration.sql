-- Administration invitation security foundation.
-- Raw invitation tokens are never persisted; only SHA-256 hashes are stored.
CREATE TABLE "user_invitations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "branchIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "tokenHash" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_invitations_tokenHash_key"
ON "user_invitations"("tokenHash");

CREATE INDEX "user_invitations_tenantId_companyId_email_idx"
ON "user_invitations"("tenantId", "companyId", "email");

CREATE INDEX "user_invitations_tenantId_companyId_createdAt_idx"
ON "user_invitations"("tenantId", "companyId", "createdAt" DESC);

CREATE INDEX "user_invitations_pending_idx"
ON "user_invitations"("tenantId", "companyId", "expiresAt")
WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;

ALTER TABLE "user_invitations"
ADD CONSTRAINT "user_invitations_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_invitations"
ADD CONSTRAINT "user_invitations_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "companies"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_invitations"
ADD CONSTRAINT "user_invitations_roleId_fkey"
FOREIGN KEY ("roleId") REFERENCES "roles"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_invitations"
ADD CONSTRAINT "user_invitations_invitedByUserId_fkey"
FOREIGN KEY ("invitedByUserId") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
