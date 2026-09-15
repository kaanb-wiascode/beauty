CREATE TABLE "operations_walk_in_commercial_contexts" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "visit_id" TEXT NOT NULL,
  "sale_id" TEXT NOT NULL,
  "linked_by_membership_id" TEXT NOT NULL,
  "linked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "operations_walk_in_commercial_contexts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operations_walk_in_commercial_contexts_visit_key" UNIQUE ("visit_id"),
  CONSTRAINT "operations_walk_in_commercial_contexts_visit_fkey"
    FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_walk_in_commercial_contexts_sale_fkey"
    FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_walk_in_commercial_contexts_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_walk_in_commercial_contexts_company_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_walk_in_commercial_contexts_branch_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_walk_in_commercial_contexts_membership_fkey"
    FOREIGN KEY ("linked_by_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "operations_walk_in_commercial_contexts_scope_idx"
  ON "operations_walk_in_commercial_contexts"("tenant_id", "company_id", "branch_id");
CREATE INDEX "operations_walk_in_commercial_contexts_sale_idx"
  ON "operations_walk_in_commercial_contexts"("sale_id");
