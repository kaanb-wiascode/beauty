ALTER TABLE "platform_audit_events"
    ADD COLUMN "request_id" TEXT,
    ADD COLUMN "source_ip" TEXT,
    ADD COLUMN "user_agent" TEXT,
    ADD COLUMN "risk_level" TEXT,
    ADD COLUMN "approval_request_id" TEXT;

CREATE INDEX "platform_audit_events_request_id_idx"
    ON "platform_audit_events"("request_id")
    WHERE "request_id" IS NOT NULL;

CREATE INDEX "platform_audit_events_approval_request_id_idx"
    ON "platform_audit_events"("approval_request_id")
    WHERE "approval_request_id" IS NOT NULL;

CREATE TABLE "platform_privileged_action_requests" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "requester_user_id" TEXT NOT NULL,
    "approver_user_id" TEXT,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "risk_level" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "target_entity_type" TEXT,
    "target_entity_id" TEXT,
    "target_tenant_id" TEXT,
    "reason" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "request_id" TEXT,
    "source_ip" TEXT,
    "user_agent" TEXT,
    "decision_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    "executed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),

    CONSTRAINT "platform_privileged_action_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "platform_privileged_action_requests_risk_level_check"
      CHECK ("risk_level" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    CONSTRAINT "platform_privileged_action_requests_status_check"
      CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'EXPIRED', 'CANCELLED')),
    CONSTRAINT "platform_privileged_action_requests_requester_fkey"
      FOREIGN KEY ("requester_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "platform_privileged_action_requests_approver_fkey"
      FOREIGN KEY ("approver_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "platform_privileged_action_requests_status_created_idx"
    ON "platform_privileged_action_requests"("status", "created_at" DESC);
CREATE INDEX "platform_privileged_action_requests_requester_created_idx"
    ON "platform_privileged_action_requests"("requester_user_id", "created_at" DESC);
CREATE INDEX "platform_privileged_action_requests_target_tenant_created_idx"
    ON "platform_privileged_action_requests"("target_tenant_id", "created_at" DESC)
    WHERE "target_tenant_id" IS NOT NULL;
CREATE INDEX "platform_privileged_action_requests_resource_action_idx"
    ON "platform_privileged_action_requests"("resource", "action", "created_at" DESC);

-- Privileged-operation permissions are seeded after the Platform IAM foundation
-- migration creates platform_permissions/platform_role_permissions.
