CREATE TABLE "operations_service_checklist_templates" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "service_id" TEXT NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_by_membership_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "operations_service_checklist_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operations_service_checklist_templates_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_service_checklist_templates_company_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_service_checklist_templates_branch_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_service_checklist_templates_service_fkey"
    FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_service_checklist_templates_membership_fkey"
    FOREIGN KEY ("created_by_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_service_checklist_templates_service_version_key"
    UNIQUE ("service_id", "version")
);

CREATE UNIQUE INDEX "operations_service_checklist_templates_active_service_key"
  ON "operations_service_checklist_templates"("service_id")
  WHERE "is_active" = TRUE;
CREATE INDEX "operations_service_checklist_templates_scope_idx"
  ON "operations_service_checklist_templates"("tenant_id", "branch_id", "service_id");

CREATE TABLE "operations_service_checklist_template_items" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "template_id" TEXT NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "description" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_required" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "operations_service_checklist_template_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operations_service_checklist_template_items_template_fkey"
    FOREIGN KEY ("template_id") REFERENCES "operations_service_checklist_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_service_checklist_template_items_code_key"
    UNIQUE ("template_id", "code")
);

CREATE TABLE "operations_service_execution_checklist_items" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "execution_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "template_id" TEXT NOT NULL,
  "template_version" INTEGER NOT NULL,
  "item_code" VARCHAR(80) NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "description" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_required" BOOLEAN NOT NULL DEFAULT TRUE,
  "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING'
    CHECK ("status" IN ('PENDING', 'COMPLETED', 'NA')),
  "note" TEXT,
  "completed_by_membership_id" TEXT,
  "completed_at" TIMESTAMPTZ,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "operations_service_execution_checklist_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operations_execution_checklist_execution_fkey"
    FOREIGN KEY ("execution_id") REFERENCES "operations_service_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_execution_checklist_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_execution_checklist_branch_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_execution_checklist_template_fkey"
    FOREIGN KEY ("template_id") REFERENCES "operations_service_checklist_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_execution_checklist_membership_fkey"
    FOREIGN KEY ("completed_by_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_execution_checklist_item_key"
    UNIQUE ("execution_id", "item_code")
);

CREATE INDEX "operations_execution_checklist_execution_idx"
  ON "operations_service_execution_checklist_items"("execution_id", "sort_order");

CREATE OR REPLACE FUNCTION operations_snapshot_execution_checklist()
RETURNS TRIGGER AS $$
DECLARE
  active_template RECORD;
BEGIN
  SELECT t.id, t.version
    INTO active_template
  FROM operations_service_checklist_templates t
  WHERE t.service_id = NEW.service_id
    AND t.tenant_id = NEW.tenant_id
    AND t.company_id = NEW.company_id
    AND t.branch_id = NEW.branch_id
    AND t.is_active = TRUE
  LIMIT 1;

  IF active_template.id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO operations_service_execution_checklist_items (
    execution_id,
    tenant_id,
    branch_id,
    template_id,
    template_version,
    item_code,
    title,
    description,
    sort_order,
    is_required
  )
  SELECT
    NEW.id,
    NEW.tenant_id,
    NEW.branch_id,
    active_template.id,
    active_template.version,
    i.code,
    i.title,
    i.description,
    i.sort_order,
    i.is_required
  FROM operations_service_checklist_template_items i
  WHERE i.template_id = active_template.id
  ORDER BY i.sort_order ASC, i.id ASC
  ON CONFLICT (execution_id, item_code) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS operations_service_execution_checklist_snapshot
  ON operations_service_executions;
CREATE TRIGGER operations_service_execution_checklist_snapshot
AFTER INSERT ON operations_service_executions
FOR EACH ROW
EXECUTE FUNCTION operations_snapshot_execution_checklist();

CREATE OR REPLACE FUNCTION operations_require_execution_checklist_completion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = NEW.status OR NEW.status <> 'COMPLETED'::"ServiceExecutionStatus" THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM operations_service_execution_checklist_items i
    WHERE i.execution_id = NEW.id
      AND i.is_required = TRUE
      AND i.status <> 'COMPLETED'
  ) THEN
    RAISE EXCEPTION 'Required service execution checklist items are incomplete';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS operations_service_execution_checklist_completion_guard
  ON operations_service_executions;
CREATE TRIGGER operations_service_execution_checklist_completion_guard
BEFORE UPDATE OF status ON operations_service_executions
FOR EACH ROW
EXECUTE FUNCTION operations_require_execution_checklist_completion();
