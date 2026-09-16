-- Marketplace publication is explicit opt-in and branch scoped.
CREATE TABLE "marketplace_publications" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNPUBLISHED',
    "published_at" TIMESTAMP(3),
    "unpublished_at" TIMESTAMP(3),
    "published_by_user_id" TEXT,
    "unpublished_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplace_publications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "marketplace_publications_status_check"
      CHECK ("status" IN ('UNPUBLISHED', 'PUBLISHED'))
);

CREATE UNIQUE INDEX "marketplace_publications_branch_id_key"
  ON "marketplace_publications"("branch_id");
CREATE INDEX "marketplace_publications_tenant_company_status_idx"
  ON "marketplace_publications"("tenant_id", "company_id", "status");

ALTER TABLE "marketplace_publications"
  ADD CONSTRAINT "marketplace_publications_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketplace_publications"
  ADD CONSTRAINT "marketplace_publications_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketplace_publications"
  ADD CONSTRAINT "marketplace_publications_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION validate_marketplace_publication_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "branches" b
    JOIN "companies" c ON c."id" = b."companyId"
    WHERE b."id" = NEW."branch_id"
      AND b."companyId" = NEW."company_id"
      AND c."tenantId" = NEW."tenant_id"
  ) THEN
    RAISE EXCEPTION 'Marketplace publication organization scope mismatch';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER marketplace_publications_scope_guard
BEFORE INSERT OR UPDATE OF "tenant_id", "company_id", "branch_id"
ON "marketplace_publications"
FOR EACH ROW
EXECUTE FUNCTION validate_marketplace_publication_scope();
