CREATE TABLE "sod_policy_definitions" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "requesterCannotApprove" BOOLEAN NOT NULL DEFAULT TRUE,
  "requireDistinctApprovers" BOOLEAN NOT NULL DEFAULT FALSE,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sod_policy_definitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sod_policy_definitions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sod_policy_definitions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sod_policy_definitions_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sod_policy_definitions_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "sod_policy_definitions_tenant_company_domain_key"
  ON "sod_policy_definitions"("tenantId", "companyId", "domain");
CREATE INDEX "sod_policy_definitions_company_enabled_idx"
  ON "sod_policy_definitions"("companyId", "enabled");

CREATE TABLE "privacy_policy_definitions" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "dataCategory" TEXT NOT NULL,
  "retentionDays" INTEGER,
  "legalBasisReference" TEXT,
  "notes" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "privacy_policy_definitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "privacy_policy_definitions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "privacy_policy_definitions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "privacy_policy_definitions_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "privacy_policy_definitions_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "privacy_policy_definitions_retentionDays_check" CHECK ("retentionDays" IS NULL OR "retentionDays" > 0)
);

CREATE UNIQUE INDEX "privacy_policy_definitions_tenant_company_category_key"
  ON "privacy_policy_definitions"("tenantId", "companyId", "dataCategory");

CREATE TABLE "privacy_requests" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "requestType" TEXT NOT NULL,
  "subjectType" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "requestedByUserId" TEXT NOT NULL,
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "resolutionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "privacy_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "privacy_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "privacy_requests_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "privacy_requests_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "privacy_requests_type_check" CHECK ("requestType" IN ('EXPORT','ANONYMIZATION','DELETION_REVIEW')),
  CONSTRAINT "privacy_requests_status_check" CHECK ("status" IN ('PENDING','IN_REVIEW','APPROVED','REJECTED','COMPLETED','CANCELLED'))
);

CREATE INDEX "privacy_requests_company_status_idx"
  ON "privacy_requests"("companyId", "status", "createdAt");
CREATE INDEX "privacy_requests_subject_idx"
  ON "privacy_requests"("tenantId", "companyId", "subjectType", "subjectId");
