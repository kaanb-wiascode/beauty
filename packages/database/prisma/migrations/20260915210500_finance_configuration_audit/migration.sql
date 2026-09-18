CREATE TABLE "finance_configuration_audit_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "actor_id" TEXT,
    "before_state" JSONB,
    "after_state" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_configuration_audit_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "finance_configuration_audit_events_operation_check"
      CHECK ("operation" IN ('CREATE','UPDATE','DELETE'))
);

CREATE INDEX "finance_configuration_audit_events_tenant_company_created_at_idx"
    ON "finance_configuration_audit_events"("tenant_id", "company_id", "created_at");
CREATE INDEX "finance_configuration_audit_events_entity_idx"
    ON "finance_configuration_audit_events"("entity_type", "entity_id", "created_at");

ALTER TABLE "finance_configuration_audit_events"
    ADD CONSTRAINT "finance_configuration_audit_events_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_configuration_audit_events"
    ADD CONSTRAINT "finance_configuration_audit_events_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION finance_configuration_audit_capture()
RETURNS TRIGGER AS $$
DECLARE
    source_row JSONB;
    target_tenant_id TEXT;
    target_company_id TEXT;
    target_entity_id TEXT;
    target_operation TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        source_row := to_jsonb(OLD);
        target_operation := 'DELETE';
    ELSIF TG_OP = 'UPDATE' THEN
        source_row := to_jsonb(NEW);
        target_operation := 'UPDATE';
    ELSE
        source_row := to_jsonb(NEW);
        target_operation := 'CREATE';
    END IF;

    target_tenant_id := source_row ->> 'tenant_id';
    target_company_id := source_row ->> 'company_id';
    target_entity_id := source_row ->> 'id';

    INSERT INTO finance_configuration_audit_events(
        id,
        tenant_id,
        company_id,
        entity_type,
        entity_id,
        operation,
        actor_id,
        before_state,
        after_state
    ) VALUES (
        md5(random()::text || clock_timestamp()::text || txid_current()::text || TG_TABLE_NAME || target_entity_id),
        target_tenant_id,
        target_company_id,
        TG_TABLE_NAME,
        target_entity_id,
        target_operation,
        NULL,
        CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
    );

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION finance_configuration_audit_immutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Finance configuration audit events are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER finance_configuration_audit_events_immutable_update
BEFORE UPDATE ON "finance_configuration_audit_events"
FOR EACH ROW EXECUTE FUNCTION finance_configuration_audit_immutable();

CREATE TRIGGER finance_configuration_audit_events_immutable_delete
BEFORE DELETE ON "finance_configuration_audit_events"
FOR EACH ROW EXECUTE FUNCTION finance_configuration_audit_immutable();

CREATE TRIGGER expense_categories_configuration_audit
AFTER INSERT OR UPDATE OR DELETE ON "expense_categories"
FOR EACH ROW EXECUTE FUNCTION finance_configuration_audit_capture();

CREATE TRIGGER income_categories_configuration_audit
AFTER INSERT OR UPDATE OR DELETE ON "income_categories"
FOR EACH ROW EXECUTE FUNCTION finance_configuration_audit_capture();

CREATE TRIGGER finance_cost_centers_configuration_audit
AFTER INSERT OR UPDATE OR DELETE ON "finance_cost_centers"
FOR EACH ROW EXECUTE FUNCTION finance_configuration_audit_capture();

CREATE TRIGGER expense_accounting_mappings_configuration_audit
AFTER INSERT OR UPDATE OR DELETE ON "expense_accounting_mappings"
FOR EACH ROW EXECUTE FUNCTION finance_configuration_audit_capture();

CREATE TRIGGER income_accounting_mappings_configuration_audit
AFTER INSERT OR UPDATE OR DELETE ON "income_accounting_mappings"
FOR EACH ROW EXECUTE FUNCTION finance_configuration_audit_capture();
