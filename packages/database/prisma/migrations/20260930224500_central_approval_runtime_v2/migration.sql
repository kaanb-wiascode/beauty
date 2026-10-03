ALTER TABLE approval_requests
  DROP CONSTRAINT IF EXISTS approval_requests_status_check;

ALTER TABLE approval_requests
  ADD CONSTRAINT approval_requests_status_check
  CHECK (status IN ('PENDING','APPROVED','REJECTED','RETURNED','CANCELLED'));

ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS "stepStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE approval_request_steps
  DROP CONSTRAINT IF EXISTS approval_request_steps_status_check;

ALTER TABLE approval_request_steps
  ADD CONSTRAINT approval_request_steps_status_check
  CHECK (status IN ('WAITING','PENDING','APPROVED','REJECTED','RETURNED','SKIPPED'));

ALTER TABLE approval_request_steps
  ADD COLUMN IF NOT EXISTS "approverType" TEXT,
  ADD COLUMN IF NOT EXISTS "approverValue" TEXT,
  ADD COLUMN IF NOT EXISTS "slaMinutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "escalationApproverType" TEXT,
  ADD COLUMN IF NOT EXISTS "escalationApproverValue" TEXT,
  ADD COLUMN IF NOT EXISTS "timeoutAction" TEXT NOT NULL DEFAULT 'ESCALATE',
  ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3);

ALTER TABLE approval_request_steps
  ADD CONSTRAINT approval_request_steps_approver_type_check
  CHECK (
    "approverType" IS NULL OR
    "approverType" IN (
      'ROLE','USER','PERMISSION',
      'MANAGER','DIRECT_MANAGER','BRANCH_MANAGER',
      'REGIONAL_MANAGER','DEPARTMENT_MANAGER','ORGANIZATION_MANAGER'
    )
  );

ALTER TABLE approval_request_steps
  ADD CONSTRAINT approval_request_steps_sla_minutes_check
  CHECK ("slaMinutes" IS NULL OR "slaMinutes" > 0);

ALTER TABLE approval_request_steps
  ADD CONSTRAINT approval_request_steps_timeout_action_check
  CHECK ("timeoutAction" IN ('ESCALATE','AUTO_APPROVE','AUTO_REJECT','NOTIFY'));

UPDATE approval_request_steps
SET "approverType" = CASE
  WHEN "approverPermission" IS NOT NULL THEN 'PERMISSION'
  WHEN "approverRoleSlug" IS NOT NULL THEN 'ROLE'
  ELSE "approverType"
END,
"approverValue" = COALESCE(
  "approverPermission",
  "approverRoleSlug",
  "approverValue"
)
WHERE "approverType" IS NULL;

UPDATE approval_request_steps
SET "startedAt" = COALESCE("startedAt","createdAt")
WHERE status='PENDING' AND "startedAt" IS NULL;

CREATE INDEX IF NOT EXISTS approval_request_steps_sla_idx
  ON approval_request_steps("requestId",status,"startedAt","slaMinutes");

CREATE TABLE IF NOT EXISTS approval_request_actions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  "companyId" TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "requestId" TEXT NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  "stepOrder" INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN (
    'SUBMIT','APPROVE','REJECT','RETURN','RESUBMIT','DELEGATE','ESCALATE',
    'AUTO_APPROVE','AUTO_REJECT','CANCEL'
  )),
  "actorUserId" TEXT REFERENCES users(id) ON DELETE SET NULL,
  "delegateToUserId" TEXT REFERENCES users(id) ON DELETE SET NULL,
  comment TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS approval_request_actions_history_idx
  ON approval_request_actions("requestId","createdAt");
