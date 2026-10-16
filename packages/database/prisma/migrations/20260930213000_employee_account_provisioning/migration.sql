ALTER TABLE user_invitations
  ADD COLUMN IF NOT EXISTS "provisionedUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "staffId" TEXT;

CREATE INDEX IF NOT EXISTS user_invitations_staff_idx
  ON user_invitations("tenantId","companyId","staffId");

CREATE UNIQUE INDEX IF NOT EXISTS user_invitations_pending_staff_uidx
  ON user_invitations("tenantId","staffId")
  WHERE "staffId" IS NOT NULL
    AND "acceptedAt" IS NULL
    AND "revokedAt" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='user_invitations_provisioned_user_fk'
  ) THEN
    ALTER TABLE user_invitations
      ADD CONSTRAINT user_invitations_provisioned_user_fk
      FOREIGN KEY ("provisionedUserId") REFERENCES users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='user_invitations_staff_fk'
  ) THEN
    ALTER TABLE user_invitations
      ADD CONSTRAINT user_invitations_staff_fk
      FOREIGN KEY ("staffId") REFERENCES staff(id) ON DELETE CASCADE;
  END IF;
END $$;
