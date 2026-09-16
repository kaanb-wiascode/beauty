CREATE TABLE "income_collection_reversals" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "income_collection_id" TEXT NOT NULL,
    "journal_entry_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source_type" TEXT,
    "source_id" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "income_collection_reversals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "income_collection_reversals_collection_key"
    ON "income_collection_reversals"("income_collection_id");
CREATE UNIQUE INDEX "income_collection_reversals_journal_key"
    ON "income_collection_reversals"("journal_entry_id");
CREATE INDEX "income_collection_reversals_tenant_company_created_at_idx"
    ON "income_collection_reversals"("tenant_id", "company_id", "created_at");
CREATE UNIQUE INDEX "income_collection_reversals_source_idempotency_key"
    ON "income_collection_reversals"("tenant_id", "company_id", "source_type", "source_id")
    WHERE "source_type" IS NOT NULL AND "source_id" IS NOT NULL;

ALTER TABLE "income_collection_reversals"
    ADD CONSTRAINT "income_collection_reversals_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "income_collection_reversals"
    ADD CONSTRAINT "income_collection_reversals_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "income_collection_reversals"
    ADD CONSTRAINT "income_collection_reversals_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "income_collection_reversals"
    ADD CONSTRAINT "income_collection_reversals_income_collection_id_fkey"
    FOREIGN KEY ("income_collection_id") REFERENCES "income_collections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "income_collection_reversals"
    ADD CONSTRAINT "income_collection_reversals_journal_entry_id_fkey"
    FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
