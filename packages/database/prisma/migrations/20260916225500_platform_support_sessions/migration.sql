CREATE TABLE "platform_support_sessions" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "approval_request_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "support_ticket_id" TEXT,
  "requester_platform_user_id" TEXT NOT NULL,
  "approver_platform_user_id" TEXT NOT NULL,
  "opened_by_platform_user_id" TEXT NOT NULL,
  "access_mode" TEXT NOT NULL DEFAULT 'READ_ONLY',
  "scopes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "revoked_by_platform_user_id" TEXT,
  "revoke_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_support_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_support_sessions_approval_key" UNIQUE ("approval_request_id"),
  CONSTRAINT "platform_support_sessions_approval_fkey"
    FOREIGN KEY ("approval_request_id") REFERENCES "platform_privileged_action_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "platform_support_sessions_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "platform_support_sessions_ticket_fkey"
    FOREIGN KEY ("support_ticket_id") REFERENCES "platform_support_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "platform_support_sessions_requester_fkey"
    FOREIGN KEY ("requester_platform_user_id") REFERENCES "platform_admin_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "platform_support_sessions_approver_fkey"
    FOREIGN KEY ("approver_platform_user_id") REFERENCES "platform_admin_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "platform_support_sessions_opened_by_fkey"
    FOREIGN KEY ("opened_by_platform_user_id") REFERENCES "platform_admin_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "platform_support_sessions_revoked_by_fkey"
    FOREIGN KEY ("revoked_by_platform_user_id") REFERENCES "platform_admin_users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "platform_support_sessions_access_mode_check"
    CHECK ("access_mode" IN ('READ_ONLY','CONTROLLED_WRITE')),
  CONSTRAINT "platform_support_sessions_status_check"
    CHECK ("status" IN ('ACTIVE','REVOKED','EXPIRED')),
  CONSTRAINT "platform_support_sessions_reason_check"
    CHECK (char_length(trim("reason")) BETWEEN 8 AND 500),
  CONSTRAINT "platform_support_sessions_expiry_check"
    CHECK ("expires_at" > "started_at" AND "expires_at" <= "started_at" + INTERVAL '2 hours')
);

CREATE INDEX "platform_support_sessions_tenant_active_idx"
  ON "platform_support_sessions" ("tenant_id", "expires_at")
  WHERE "status" = 'ACTIVE';
CREATE INDEX "platform_support_sessions_requester_idx"
  ON "platform_support_sessions" ("requester_platform_user_id", "created_at" DESC);
CREATE INDEX "platform_support_sessions_ticket_idx"
  ON "platform_support_sessions" ("support_ticket_id", "created_at" DESC)
  WHERE "support_ticket_id" IS NOT NULL;

INSERT INTO "platform_permissions" ("resource", "action", "description") VALUES
  ('support_session', 'read', 'Read governed support sessions and access scope'),
  ('support_session', 'manage', 'Request and revoke governed tenant support sessions')
ON CONFLICT ("resource", "action") DO NOTHING;

INSERT INTO "platform_role_permissions" ("role_slug", "resource", "action") VALUES
  ('PLATFORM_OWNER', 'support_session', 'read'),
  ('PLATFORM_OWNER', 'support_session', 'manage'),
  ('PLATFORM_ADMIN', 'support_session', 'read'),
  ('PLATFORM_ADMIN', 'support_session', 'manage'),
  ('PLATFORM_AUDITOR', 'support_session', 'read')
ON CONFLICT ("role_slug", "resource", "action") DO NOTHING;
