CREATE TABLE "report_saved_views" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "owner_id" TEXT NOT NULL,
  "report_key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "filters" JSONB NOT NULL,
  "columns" JSONB NOT NULL,
  "sort" JSONB,
  "is_favorite" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "report_saved_views_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "report_saved_views_name_check" CHECK (length(trim("name")) BETWEEN 1 AND 120)
);

CREATE INDEX "report_saved_views_owner_updated_idx"
  ON "report_saved_views" ("tenant_id", "company_id", "owner_id", "updated_at" DESC);

CREATE INDEX "report_saved_views_owner_report_idx"
  ON "report_saved_views" ("tenant_id", "company_id", "owner_id", "report_key");

CREATE UNIQUE INDEX "report_saved_views_owner_name_key"
  ON "report_saved_views" ("tenant_id", "company_id", "owner_id", lower("name"));
