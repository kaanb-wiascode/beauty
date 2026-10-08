CREATE TABLE "company_security_policies" (
  "companyId" TEXT NOT NULL,
  "requireMfa" BOOLEAN NOT NULL DEFAULT FALSE,
  "sessionMaxAgeMinutes" INTEGER NOT NULL DEFAULT 10080,
  "idleTimeoutMinutes" INTEGER NOT NULL DEFAULT 480,
  "passwordMinLength" INTEGER NOT NULL DEFAULT 8,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_security_policies_pkey" PRIMARY KEY ("companyId"),
  CONSTRAINT "company_security_policies_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "company_security_policies_updatedByUserId_fkey"
    FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "company_security_policies_sessionMaxAgeMinutes_check"
    CHECK ("sessionMaxAgeMinutes" BETWEEN 15 AND 43200),
  CONSTRAINT "company_security_policies_idleTimeoutMinutes_check"
    CHECK ("idleTimeoutMinutes" BETWEEN 5 AND 10080),
  CONSTRAINT "company_security_policies_passwordMinLength_check"
    CHECK ("passwordMinLength" BETWEEN 8 AND 128)
);

CREATE INDEX "company_security_policies_updatedByUserId_idx"
  ON "company_security_policies"("updatedByUserId");
