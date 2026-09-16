CREATE TABLE "operations_branch_checklist_templates" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "category" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_by_membership_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operations_branch_checklist_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operations_branch_checklist_templates_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_branch_checklist_templates_company_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_branch_checklist_templates_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_branch_checklist_templates_membership_fkey" FOREIGN KEY ("created_by_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_branch_checklist_templates_category_check" CHECK ("category" IN ('OPENING','CLOSING')),
  CONSTRAINT "operations_branch_checklist_templates_status_check" CHECK ("status" IN ('ACTIVE','INACTIVE')),
  CONSTRAINT "operations_branch_checklist_templates_version_check" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "operations_branch_checklist_templates_active_scope_uidx"
  ON "operations_branch_checklist_templates"("tenant_id", "company_id", COALESCE("branch_id", ''), "category")
  WHERE "status" = 'ACTIVE';

CREATE TABLE "operations_branch_checklist_template_items" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "template_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_required" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operations_branch_checklist_template_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operations_branch_checklist_template_items_template_fkey" FOREIGN KEY ("template_id") REFERENCES "operations_branch_checklist_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_branch_checklist_template_items_code_uidx" UNIQUE ("template_id", "code")
);

CREATE TABLE "operations_branch_checklist_runs" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "template_id" TEXT NOT NULL,
  "template_version" INTEGER NOT NULL,
  "category" TEXT NOT NULL,
  "template_name" TEXT NOT NULL,
  "business_date" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "started_by_membership_id" TEXT NOT NULL,
  "completed_by_membership_id" TEXT,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operations_branch_checklist_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operations_branch_checklist_runs_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_branch_checklist_runs_company_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_branch_checklist_runs_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_branch_checklist_runs_template_fkey" FOREIGN KEY ("template_id") REFERENCES "operations_branch_checklist_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_branch_checklist_runs_started_membership_fkey" FOREIGN KEY ("started_by_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_branch_checklist_runs_completed_membership_fkey" FOREIGN KEY ("completed_by_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_branch_checklist_runs_category_check" CHECK ("category" IN ('OPENING','CLOSING')),
  CONSTRAINT "operations_branch_checklist_runs_status_check" CHECK ("status" IN ('OPEN','COMPLETED')),
  CONSTRAINT "operations_branch_checklist_runs_version_check" CHECK ("version" > 0),
  CONSTRAINT "operations_branch_checklist_runs_unique_day" UNIQUE ("branch_id", "category", "business_date")
);

CREATE INDEX "operations_branch_checklist_runs_scope_date_idx"
  ON "operations_branch_checklist_runs"("tenant_id", "company_id", "branch_id", "business_date", "category");

CREATE TABLE "operations_branch_checklist_run_items" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "run_id" TEXT NOT NULL,
  "item_code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_required" BOOLEAN NOT NULL DEFAULT TRUE,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "note" TEXT,
  "completed_by_membership_id" TEXT,
  "completed_at" TIMESTAMPTZ,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operations_branch_checklist_run_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operations_branch_checklist_run_items_run_fkey" FOREIGN KEY ("run_id") REFERENCES "operations_branch_checklist_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_branch_checklist_run_items_membership_fkey" FOREIGN KEY ("completed_by_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_branch_checklist_run_items_status_check" CHECK ("status" IN ('PENDING','COMPLETED','NA')),
  CONSTRAINT "operations_branch_checklist_run_items_version_check" CHECK ("version" > 0),
  CONSTRAINT "operations_branch_checklist_run_items_code_uidx" UNIQUE ("run_id", "item_code")
);

CREATE TABLE "operations_branch_checklist_events" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "run_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "actor_membership_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operations_branch_checklist_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operations_branch_checklist_events_run_fkey" FOREIGN KEY ("run_id") REFERENCES "operations_branch_checklist_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_branch_checklist_events_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_branch_checklist_events_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_branch_checklist_events_membership_fkey" FOREIGN KEY ("actor_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "operations_branch_checklist_events_run_created_idx"
  ON "operations_branch_checklist_events"("run_id", "created_at");

CREATE OR REPLACE FUNCTION validate_operations_branch_checklist_run_completion()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'COMPLETED' AND OLD.status <> 'COMPLETED' THEN
    IF EXISTS (
      SELECT 1
      FROM operations_branch_checklist_run_items i
      WHERE i.run_id = NEW.id
        AND i.is_required = TRUE
        AND i.status <> 'COMPLETED'
    ) THEN
      RAISE EXCEPTION 'Required branch checklist items must be completed before run completion';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER operations_branch_checklist_run_completion_guard
BEFORE UPDATE OF status ON operations_branch_checklist_runs
FOR EACH ROW EXECUTE FUNCTION validate_operations_branch_checklist_run_completion();
