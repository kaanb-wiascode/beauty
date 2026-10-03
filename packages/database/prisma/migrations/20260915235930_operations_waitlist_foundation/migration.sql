DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OperationsWaitlistStatus') THEN
    CREATE TYPE "OperationsWaitlistStatus" AS ENUM (
      'WAITING',
      'MATCH_FOUND',
      'CONTACTED',
      'BOOKED',
      'EXPIRED',
      'CANCELLED'
    );
  END IF;
END $$;

CREATE TABLE "operations_waitlist_entries" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "service_id" TEXT NOT NULL,
  "preferred_staff_id" TEXT,
  "desired_from" TIMESTAMPTZ NOT NULL,
  "desired_to" TIMESTAMPTZ NOT NULL,
  "preferred_time_start" TIME,
  "preferred_time_end" TIME,
  "priority" INTEGER NOT NULL DEFAULT 50 CHECK ("priority" BETWEEN 0 AND 100),
  "contact_channel" VARCHAR(20) NOT NULL DEFAULT 'ANY'
    CHECK ("contact_channel" IN ('ANY', 'PHONE', 'SMS', 'WHATSAPP', 'EMAIL')),
  "status" "OperationsWaitlistStatus" NOT NULL DEFAULT 'WAITING',
  "matched_slot_from" TIMESTAMPTZ,
  "matched_slot_to" TIMESTAMPTZ,
  "booked_appointment_id" TEXT,
  "note" TEXT,
  "expires_at" TIMESTAMPTZ,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by_membership_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "operations_waitlist_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operations_waitlist_window_check" CHECK ("desired_from" < "desired_to"),
  CONSTRAINT "operations_waitlist_preferred_time_check" CHECK (
    "preferred_time_start" IS NULL OR "preferred_time_end" IS NULL OR
    "preferred_time_start" < "preferred_time_end"
  ),
  CONSTRAINT "operations_waitlist_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_waitlist_company_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_waitlist_branch_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_waitlist_customer_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_waitlist_service_fkey"
    FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_waitlist_staff_fkey"
    FOREIGN KEY ("preferred_staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_waitlist_appointment_fkey"
    FOREIGN KEY ("booked_appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "operations_waitlist_membership_fkey"
    FOREIGN KEY ("created_by_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "operations_waitlist_scope_status_idx"
  ON "operations_waitlist_entries"("tenant_id", "branch_id", "status", "priority", "created_at");
CREATE INDEX "operations_waitlist_service_window_idx"
  ON "operations_waitlist_entries"("branch_id", "service_id", "desired_from", "desired_to")
  WHERE "status" IN ('WAITING', 'MATCH_FOUND', 'CONTACTED');
CREATE INDEX "operations_waitlist_customer_idx"
  ON "operations_waitlist_entries"("tenant_id", "branch_id", "customer_id", "created_at");

CREATE TABLE "operations_waitlist_events" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "waitlist_entry_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "actor_membership_id" TEXT NOT NULL,
  "event_type" VARCHAR(80) NOT NULL,
  "from_status" "OperationsWaitlistStatus",
  "to_status" "OperationsWaitlistStatus",
  "note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "operations_waitlist_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operations_waitlist_events_entry_fkey"
    FOREIGN KEY ("waitlist_entry_id") REFERENCES "operations_waitlist_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_waitlist_events_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_waitlist_events_branch_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_waitlist_events_membership_fkey"
    FOREIGN KEY ("actor_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "operations_waitlist_events_entry_created_idx"
  ON "operations_waitlist_events"("waitlist_entry_id", "created_at");
