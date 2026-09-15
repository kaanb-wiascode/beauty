CREATE TABLE "approval_requests" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "companyId" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "branchId" TEXT NULL REFERENCES "branches"("id") ON DELETE SET NULL,
  "workflowDefinitionId" TEXT NOT NULL REFERENCES "approval_workflow_definitions"("id") ON DELETE RESTRICT,
  "workflowKey" TEXT NOT NULL,
  "workflowVersion" INTEGER NOT NULL,
  "domain" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  "currentStepOrder" INTEGER NOT NULL DEFAULT 1,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "reason" TEXT NULL,
  "completedAt" TIMESTAMP(3) NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "approval_requests_scope_status_idx" ON "approval_requests"("tenantId","companyId","status");
CREATE INDEX "approval_requests_entity_idx" ON "approval_requests"("tenantId","companyId","entityType","entityId");

CREATE TABLE "approval_request_steps" (
  "id" TEXT PRIMARY KEY,
  "requestId" TEXT NOT NULL REFERENCES "approval_requests"("id") ON DELETE CASCADE,
  "stepOrder" INTEGER NOT NULL,
  "stepKey" TEXT NOT NULL,
  "stepName" TEXT NOT NULL,
  "approverPermission" TEXT NULL,
  "approverRoleSlug" TEXT NULL,
  "status" TEXT NOT NULL DEFAULT 'WAITING' CHECK ("status" IN ('WAITING','PENDING','APPROVED','REJECTED','SKIPPED')),
  "actedByUserId" TEXT NULL REFERENCES "users"("id") ON DELETE SET NULL,
  "actedAt" TIMESTAMP(3) NULL,
  "comment" TEXT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("requestId","stepOrder")
);

CREATE INDEX "approval_request_steps_pending_idx" ON "approval_request_steps"("requestId","status","stepOrder");

CREATE TABLE "approval_delegations" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "companyId" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "delegatorUserId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "delegateUserId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "domain" TEXT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "revokedAt" TIMESTAMP(3) NULL,
  "createdByUserId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("delegatorUserId" <> "delegateUserId"),
  CHECK ("endsAt" > "startsAt")
);

CREATE INDEX "approval_delegations_active_idx" ON "approval_delegations"("tenantId","companyId","delegatorUserId","startsAt","endsAt");
