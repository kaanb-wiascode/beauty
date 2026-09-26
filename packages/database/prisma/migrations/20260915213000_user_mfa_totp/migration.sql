CREATE TABLE IF NOT EXISTS "user_mfa_totp" (
    "userId" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "enabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_mfa_totp_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "user_mfa_totp"
ADD CONSTRAINT "user_mfa_totp_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "user_mfa_totp_enabledAt_idx"
ON "user_mfa_totp"("enabledAt");
