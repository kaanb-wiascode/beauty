-- Finance integrity hardening for Phase 1 operational records.
-- Preserve audit history, enforce idempotency source pairs at the database boundary,
-- and prevent duplicate tenant-global category codes where company_id is NULL.

CREATE UNIQUE INDEX "expense_categories_tenant_global_code_key"
    ON "expense_categories"("tenant_id", "code")
    WHERE "company_id" IS NULL;

CREATE UNIQUE INDEX "income_categories_tenant_global_code_key"
    ON "income_categories"("tenant_id", "code")
    WHERE "company_id" IS NULL;

ALTER TABLE "expenses"
    ADD CONSTRAINT "expenses_source_pair_check"
    CHECK (("source_type" IS NULL) = ("source_id" IS NULL));

ALTER TABLE "income_records"
    ADD CONSTRAINT "income_records_source_pair_check"
    CHECK (("source_type" IS NULL) = ("source_id" IS NULL));

ALTER TABLE "income_collections"
    ADD CONSTRAINT "income_collections_source_pair_check"
    CHECK (("source_type" IS NULL) = ("source_id" IS NULL));

ALTER TABLE "income_collection_reversals"
    ADD CONSTRAINT "income_collection_reversals_source_pair_check"
    CHECK (("source_type" IS NULL) = ("source_id" IS NULL));

ALTER TABLE "expense_audit_events"
    DROP CONSTRAINT "expense_audit_events_expense_id_fkey";
ALTER TABLE "expense_audit_events"
    ADD CONSTRAINT "expense_audit_events_expense_id_fkey"
    FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "income_audit_events"
    DROP CONSTRAINT "income_audit_events_income_record_id_fkey";
ALTER TABLE "income_audit_events"
    ADD CONSTRAINT "income_audit_events_income_record_id_fkey"
    FOREIGN KEY ("income_record_id") REFERENCES "income_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
