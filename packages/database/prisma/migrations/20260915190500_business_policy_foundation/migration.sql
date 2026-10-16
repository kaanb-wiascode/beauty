CREATE TABLE IF NOT EXISTS "business_policy_definitions" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "companyId" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "policyKey" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT','PUBLISHED','ARCHIVED')),
  "rules" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdByUserId" TEXT NOT NULL REFERENCES "users"("id"),
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "business_policy_definitions_key_version_uq" ON "business_policy_definitions"("tenantId","companyId","policyKey","version");
CREATE INDEX IF NOT EXISTS "business_policy_definitions_lookup_idx" ON "business_policy_definitions"("tenantId","companyId","domain","action","status");
