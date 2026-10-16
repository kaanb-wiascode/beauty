CREATE TABLE "platform_support_sla_policies" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "priority" TEXT NOT NULL,
  "clock_mode" TEXT NOT NULL DEFAULT 'CALENDAR',
  "initial_response_minutes" INTEGER NOT NULL,
  "resolution_minutes" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_by_platform_user_id" TEXT,
  "updated_by_platform_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_support_sla_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_support_sla_policies_priority_check"
    CHECK ("priority" IN ('LOW','MEDIUM','HIGH','URGENT')),
  CONSTRAINT "platform_support_sla_policies_clock_check"
    CHECK ("clock_mode" IN ('CALENDAR')),
  CONSTRAINT "platform_support_sla_policies_response_check"
    CHECK ("initial_response_minutes" > 0),
  CONSTRAINT "platform_support_sla_policies_resolution_check"
    CHECK ("resolution_minutes" >= "initial_response_minutes"),
  CONSTRAINT "platform_support_sla_policies_status_check"
    CHECK ("status" IN ('ACTIVE','INACTIVE')),
  CONSTRAINT "platform_support_sla_policies_created_by_fkey"
    FOREIGN KEY ("created_by_platform_user_id") REFERENCES "platform_admin_users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "platform_support_sla_policies_updated_by_fkey"
    FOREIGN KEY ("updated_by_platform_user_id") REFERENCES "platform_admin_users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "platform_support_sla_policies_active_priority_idx"
  ON "platform_support_sla_policies" ("priority")
  WHERE "status" = 'ACTIVE';

INSERT INTO "platform_support_sla_policies" (
  name, priority, initial_response_minutes, resolution_minutes
) VALUES
  ('Default Low', 'LOW', 480, 4320),
  ('Default Medium', 'MEDIUM', 240, 1440),
  ('Default High', 'HIGH', 60, 480),
  ('Default Urgent', 'URGENT', 15, 240)
ON CONFLICT DO NOTHING;

CREATE TABLE "platform_support_tickets" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "description" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "source" TEXT NOT NULL DEFAULT 'PLATFORM',
  "requester_email" TEXT,
  "assigned_platform_user_id" TEXT,
  "sla_policy_id" TEXT NOT NULL,
  "response_due_at" TIMESTAMP(3) NOT NULL,
  "resolution_due_at" TIMESTAMP(3) NOT NULL,
  "first_response_at" TIMESTAMP(3),
  "resolved_at" TIMESTAMP(3),
  "closed_at" TIMESTAMP(3),
  "created_by_platform_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_support_tickets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_support_tickets_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "platform_support_tickets_assignee_fkey"
    FOREIGN KEY ("assigned_platform_user_id") REFERENCES "platform_admin_users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "platform_support_tickets_policy_fkey"
    FOREIGN KEY ("sla_policy_id") REFERENCES "platform_support_sla_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "platform_support_tickets_created_by_fkey"
    FOREIGN KEY ("created_by_platform_user_id") REFERENCES "platform_admin_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "platform_support_tickets_subject_check"
    CHECK (char_length(trim("subject")) BETWEEN 1 AND 300),
  CONSTRAINT "platform_support_tickets_description_check"
    CHECK ("description" IS NULL OR char_length("description") <= 10000),
  CONSTRAINT "platform_support_tickets_priority_check"
    CHECK ("priority" IN ('LOW','MEDIUM','HIGH','URGENT')),
  CONSTRAINT "platform_support_tickets_status_check"
    CHECK ("status" IN ('OPEN','IN_PROGRESS','PENDING_CUSTOMER','RESOLVED','CLOSED')),
  CONSTRAINT "platform_support_tickets_source_check"
    CHECK ("source" IN ('PLATFORM','TENANT','INTERNAL'))
);

CREATE INDEX "platform_support_tickets_queue_idx"
  ON "platform_support_tickets" ("status", "priority", "created_at" DESC);
CREATE INDEX "platform_support_tickets_tenant_idx"
  ON "platform_support_tickets" ("tenant_id", "created_at" DESC);
CREATE INDEX "platform_support_tickets_response_due_idx"
  ON "platform_support_tickets" ("response_due_at")
  WHERE "first_response_at" IS NULL AND "status" NOT IN ('RESOLVED','CLOSED');
CREATE INDEX "platform_support_tickets_resolution_due_idx"
  ON "platform_support_tickets" ("resolution_due_at")
  WHERE "resolved_at" IS NULL AND "status" NOT IN ('CLOSED');

CREATE TABLE "platform_support_ticket_events" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "ticket_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "from_status" TEXT,
  "to_status" TEXT,
  "note" TEXT,
  "created_by_platform_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_support_ticket_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_support_ticket_events_ticket_fkey"
    FOREIGN KEY ("ticket_id") REFERENCES "platform_support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "platform_support_ticket_events_actor_fkey"
    FOREIGN KEY ("created_by_platform_user_id") REFERENCES "platform_admin_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "platform_support_ticket_events_type_check"
    CHECK (char_length(trim("event_type")) BETWEEN 1 AND 80),
  CONSTRAINT "platform_support_ticket_events_note_check"
    CHECK ("note" IS NULL OR char_length("note") <= 5000)
);

CREATE INDEX "platform_support_ticket_events_ticket_idx"
  ON "platform_support_ticket_events" ("ticket_id", "created_at" DESC, "id" DESC);

INSERT INTO "platform_permissions" ("resource", "action", "description") VALUES
  ('support', 'read', 'Read platform support tickets and queue'),
  ('support', 'manage', 'Create and manage platform support tickets'),
  ('sla', 'read', 'Read support SLA policies and breach state'),
  ('sla', 'manage', 'Manage support SLA policies')
ON CONFLICT ("resource", "action") DO NOTHING;

INSERT INTO "platform_role_permissions" ("role_slug", "resource", "action") VALUES
  ('PLATFORM_OWNER', 'support', 'read'),
  ('PLATFORM_OWNER', 'support', 'manage'),
  ('PLATFORM_OWNER', 'sla', 'read'),
  ('PLATFORM_OWNER', 'sla', 'manage'),
  ('PLATFORM_ADMIN', 'support', 'read'),
  ('PLATFORM_ADMIN', 'support', 'manage'),
  ('PLATFORM_ADMIN', 'sla', 'read'),
  ('PLATFORM_ADMIN', 'sla', 'manage'),
  ('PLATFORM_AUDITOR', 'support', 'read'),
  ('PLATFORM_AUDITOR', 'sla', 'read')
ON CONFLICT ("role_slug", "resource", "action") DO NOTHING;
