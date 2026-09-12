BEGIN;

CREATE TABLE "crm_leads" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE RESTRICT,
  "branch_id" TEXT NOT NULL REFERENCES "branches"("id") ON DELETE RESTRICT,
  "customer_id" TEXT REFERENCES "customers"("id") ON DELETE SET NULL,
  "owner_user_id" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "first_name" TEXT NOT NULL,
  "last_name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "interest_note" TEXT,
  "lost_reason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_leads_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "crm_leads_contact_check" CHECK ("phone" IS NOT NULL OR "email" IS NOT NULL),
  CONSTRAINT "crm_leads_status_check" CHECK ("status" IN ('NEW','CONTACTED','QUALIFIED','LOST','CONVERTED')),
  CONSTRAINT "crm_leads_version_check" CHECK ("version" >= 1),
  CONSTRAINT "crm_leads_lost_reason_check" CHECK ("status" <> 'LOST' OR "lost_reason" IS NOT NULL)
);

CREATE INDEX "crm_leads_scope_status_idx"
  ON "crm_leads"("tenant_id", "company_id", "branch_id", "status", "updated_at" DESC);
CREATE INDEX "crm_leads_owner_idx"
  ON "crm_leads"("tenant_id", "company_id", "owner_user_id", "status")
  WHERE "owner_user_id" IS NOT NULL;
CREATE INDEX "crm_leads_customer_idx"
  ON "crm_leads"("customer_id") WHERE "customer_id" IS NOT NULL;

CREATE TABLE "crm_opportunities" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE RESTRICT,
  "branch_id" TEXT NOT NULL REFERENCES "branches"("id") ON DELETE RESTRICT,
  "lead_id" TEXT REFERENCES "crm_leads"("id") ON DELETE SET NULL,
  "customer_id" TEXT REFERENCES "customers"("id") ON DELETE SET NULL,
  "owner_user_id" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "title" TEXT NOT NULL,
  "stage" TEXT NOT NULL DEFAULT 'QUALIFIED',
  "estimated_value" NUMERIC(18,2),
  "currency" TEXT NOT NULL DEFAULT 'TRY',
  "probability" INTEGER NOT NULL DEFAULT 25,
  "expected_close_date" DATE,
  "lost_reason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_opportunities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "crm_opportunities_lead_key" UNIQUE ("lead_id"),
  CONSTRAINT "crm_opportunities_subject_check" CHECK ("lead_id" IS NOT NULL OR "customer_id" IS NOT NULL),
  CONSTRAINT "crm_opportunities_stage_check" CHECK ("stage" IN ('QUALIFIED','NEEDS_ANALYSIS','PROPOSAL','NEGOTIATION','WON','LOST')),
  CONSTRAINT "crm_opportunities_value_check" CHECK ("estimated_value" IS NULL OR "estimated_value" >= 0),
  CONSTRAINT "crm_opportunities_probability_check" CHECK ("probability" BETWEEN 0 AND 100),
  CONSTRAINT "crm_opportunities_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "crm_opportunities_version_check" CHECK ("version" >= 1),
  CONSTRAINT "crm_opportunities_lost_reason_check" CHECK ("stage" <> 'LOST' OR "lost_reason" IS NOT NULL)
);

CREATE INDEX "crm_opportunities_scope_stage_idx"
  ON "crm_opportunities"("tenant_id", "company_id", "branch_id", "stage", "updated_at" DESC);
CREATE INDEX "crm_opportunities_owner_idx"
  ON "crm_opportunities"("tenant_id", "company_id", "owner_user_id", "stage")
  WHERE "owner_user_id" IS NOT NULL;
CREATE INDEX "crm_opportunities_customer_idx"
  ON "crm_opportunities"("customer_id") WHERE "customer_id" IS NOT NULL;

CREATE TABLE "crm_follow_ups" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE RESTRICT,
  "branch_id" TEXT NOT NULL REFERENCES "branches"("id") ON DELETE RESTRICT,
  "lead_id" TEXT REFERENCES "crm_leads"("id") ON DELETE CASCADE,
  "opportunity_id" TEXT REFERENCES "crm_opportunities"("id") ON DELETE CASCADE,
  "assigned_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "due_at" TIMESTAMPTZ NOT NULL,
  "note" TEXT,
  "outcome" TEXT,
  "completed_at" TIMESTAMPTZ,
  "created_by_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_follow_ups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "crm_follow_ups_subject_check" CHECK (num_nonnulls("lead_id", "opportunity_id") = 1),
  CONSTRAINT "crm_follow_ups_channel_check" CHECK ("channel" IN ('CALL','SMS','EMAIL','WHATSAPP','IN_PERSON','OTHER')),
  CONSTRAINT "crm_follow_ups_status_check" CHECK ("status" IN ('OPEN','COMPLETED','CANCELLED')),
  CONSTRAINT "crm_follow_ups_completion_check" CHECK (("status" = 'COMPLETED') = ("completed_at" IS NOT NULL))
);

CREATE INDEX "crm_follow_ups_due_idx"
  ON "crm_follow_ups"("tenant_id", "company_id", "branch_id", "status", "due_at");
CREATE INDEX "crm_follow_ups_assignee_idx"
  ON "crm_follow_ups"("tenant_id", "company_id", "assigned_user_id", "status", "due_at");

CREATE TABLE "crm_events" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE RESTRICT,
  "branch_id" TEXT NOT NULL REFERENCES "branches"("id") ON DELETE RESTRICT,
  "lead_id" TEXT REFERENCES "crm_leads"("id") ON DELETE CASCADE,
  "opportunity_id" TEXT REFERENCES "crm_opportunities"("id") ON DELETE CASCADE,
  "follow_up_id" TEXT REFERENCES "crm_follow_ups"("id") ON DELETE CASCADE,
  "event_type" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "crm_events_subject_check" CHECK (num_nonnulls("lead_id", "opportunity_id", "follow_up_id") >= 1)
);

CREATE INDEX "crm_events_lead_idx" ON "crm_events"("lead_id", "created_at") WHERE "lead_id" IS NOT NULL;
CREATE INDEX "crm_events_opportunity_idx" ON "crm_events"("opportunity_id", "created_at") WHERE "opportunity_id" IS NOT NULL;
CREATE INDEX "crm_events_follow_up_idx" ON "crm_events"("follow_up_id", "created_at") WHERE "follow_up_id" IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_crm_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "companies" c
    WHERE c."id" = NEW."company_id" AND c."tenantId" = NEW."tenant_id"
  ) OR NOT EXISTS (
    SELECT 1 FROM "branches" b
    WHERE b."id" = NEW."branch_id" AND b."companyId" = NEW."company_id"
  ) THEN
    RAISE EXCEPTION 'crm organization scope mismatch';
  END IF;

  IF NEW."customer_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "customers" c
    WHERE c."id" = NEW."customer_id"
      AND c."tenantId" = NEW."tenant_id"
      AND c."branchId" = NEW."branch_id"
  ) THEN
    RAISE EXCEPTION 'crm customer scope mismatch';
  END IF;

  IF TG_TABLE_NAME = 'crm_opportunities' AND NEW."lead_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "crm_leads" l
    WHERE l."id" = NEW."lead_id"
      AND l."tenant_id" = NEW."tenant_id"
      AND l."company_id" = NEW."company_id"
      AND l."branch_id" = NEW."branch_id"
  ) THEN
    RAISE EXCEPTION 'crm lead scope mismatch';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "crm_leads_scope_guard"
BEFORE INSERT OR UPDATE ON "crm_leads"
FOR EACH ROW EXECUTE FUNCTION validate_crm_scope();

CREATE TRIGGER "crm_opportunities_scope_guard"
BEFORE INSERT OR UPDATE ON "crm_opportunities"
FOR EACH ROW EXECUTE FUNCTION validate_crm_scope();

CREATE OR REPLACE FUNCTION validate_crm_follow_up_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."lead_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "crm_leads" l
    WHERE l."id" = NEW."lead_id" AND l."tenant_id" = NEW."tenant_id"
      AND l."company_id" = NEW."company_id" AND l."branch_id" = NEW."branch_id"
  ) THEN RAISE EXCEPTION 'crm follow-up lead scope mismatch'; END IF;

  IF NEW."opportunity_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "crm_opportunities" o
    WHERE o."id" = NEW."opportunity_id" AND o."tenant_id" = NEW."tenant_id"
      AND o."company_id" = NEW."company_id" AND o."branch_id" = NEW."branch_id"
  ) THEN RAISE EXCEPTION 'crm follow-up opportunity scope mismatch'; END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "crm_follow_ups_scope_guard"
BEFORE INSERT OR UPDATE ON "crm_follow_ups"
FOR EACH ROW EXECUTE FUNCTION validate_crm_follow_up_scope();

CREATE OR REPLACE FUNCTION validate_crm_event_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "companies" c
    JOIN "branches" b ON b."companyId" = c."id"
    WHERE c."id" = NEW."company_id" AND c."tenantId" = NEW."tenant_id"
      AND b."id" = NEW."branch_id"
  ) THEN RAISE EXCEPTION 'crm event organization scope mismatch'; END IF;

  IF NEW."lead_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "crm_leads" l
    WHERE l."id" = NEW."lead_id" AND l."tenant_id" = NEW."tenant_id"
      AND l."company_id" = NEW."company_id" AND l."branch_id" = NEW."branch_id"
  ) THEN RAISE EXCEPTION 'crm event lead scope mismatch'; END IF;

  IF NEW."opportunity_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "crm_opportunities" o
    WHERE o."id" = NEW."opportunity_id" AND o."tenant_id" = NEW."tenant_id"
      AND o."company_id" = NEW."company_id" AND o."branch_id" = NEW."branch_id"
  ) THEN RAISE EXCEPTION 'crm event opportunity scope mismatch'; END IF;

  IF NEW."follow_up_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "crm_follow_ups" f
    WHERE f."id" = NEW."follow_up_id" AND f."tenant_id" = NEW."tenant_id"
      AND f."company_id" = NEW."company_id" AND f."branch_id" = NEW."branch_id"
  ) THEN RAISE EXCEPTION 'crm event follow-up scope mismatch'; END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "crm_events_scope_guard"
BEFORE INSERT ON "crm_events"
FOR EACH ROW EXECUTE FUNCTION validate_crm_event_scope();

CREATE OR REPLACE FUNCTION crm_events_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'crm events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "crm_events_append_only_guard"
BEFORE UPDATE OR DELETE ON "crm_events"
FOR EACH ROW EXECUTE FUNCTION crm_events_append_only();

INSERT INTO "permissions" ("id", "resource", "action", "description", "createdAt")
VALUES
  (gen_random_uuid()::text, 'crm', 'read', 'CRM pipeline read permission', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'crm', 'manage', 'CRM pipeline management permission', CURRENT_TIMESTAMP)
ON CONFLICT ("resource", "action") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."resource" = 'crm' AND p."action" IN ('read', 'manage')
WHERE r."slug" = 'owner'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

COMMIT;
