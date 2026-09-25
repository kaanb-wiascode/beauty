CREATE TABLE "income_collections" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "income_record_id" TEXT NOT NULL,
    "collection_account_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "collected_at" TIMESTAMP(3) NOT NULL,
    "source_type" TEXT,
    "source_id" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "income_collections_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "income_collections_positive_amount" CHECK ("amount" > 0),
    CONSTRAINT "income_collections_method" CHECK ("method" IN ('CASH','CARD','TRANSFER','OTHER'))
);

CREATE INDEX "income_collections_income_created_at_idx"
    ON "income_collections"("income_record_id", "created_at");
CREATE INDEX "income_collections_tenant_company_collected_at_idx"
    ON "income_collections"("tenant_id", "company_id", "collected_at");
CREATE UNIQUE INDEX "income_collections_source_idempotency_key"
    ON "income_collections"("tenant_id", "company_id", "source_type", "source_id")
    WHERE "source_type" IS NOT NULL AND "source_id" IS NOT NULL;

ALTER TABLE "income_collections"
    ADD CONSTRAINT "income_collections_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "income_collections"
    ADD CONSTRAINT "income_collections_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "income_collections"
    ADD CONSTRAINT "income_collections_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "income_collections"
    ADD CONSTRAINT "income_collections_income_record_id_fkey"
    FOREIGN KEY ("income_record_id") REFERENCES "income_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "income_collections"
    ADD CONSTRAINT "income_collections_collection_account_id_fkey"
    FOREIGN KEY ("collection_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
