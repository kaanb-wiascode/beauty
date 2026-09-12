ALTER TABLE "supplier_offers"
ADD COLUMN "visibility_scope" TEXT NOT NULL DEFAULT 'CONNECTED';

ALTER TABLE "supplier_offers"
ADD CONSTRAINT "supplier_offers_visibility_scope_check"
CHECK ("visibility_scope" IN ('CONNECTED','RESTRICTED'));

CREATE TABLE "supplier_offer_eligibilities" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "supplier_offer_id" TEXT NOT NULL REFERENCES "supplier_offers"("id") ON DELETE CASCADE,
  "supplier_organization_id" TEXT NOT NULL REFERENCES "supplier_organizations"("id") ON DELETE CASCADE,
  "supplier_connection_id" TEXT NOT NULL REFERENCES "supplier_connections"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "supplier_offer_eligibilities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_offer_eligibilities_offer_connection_key" UNIQUE ("supplier_offer_id", "supplier_connection_id")
);

CREATE INDEX "supplier_offer_eligibilities_connection_idx"
  ON "supplier_offer_eligibilities"("supplier_connection_id", "supplier_offer_id");
CREATE INDEX "supplier_offer_eligibilities_org_idx"
  ON "supplier_offer_eligibilities"("supplier_organization_id", "supplier_offer_id");

CREATE OR REPLACE FUNCTION validate_supplier_offer_eligibility_scope()
RETURNS TRIGGER AS $$
DECLARE
  offer_org_id TEXT;
  connection_org_id TEXT;
BEGIN
  SELECT "supplier_organization_id"
    INTO offer_org_id
  FROM "supplier_offers"
  WHERE "id" = NEW."supplier_offer_id";

  SELECT "supplier_organization_id"
    INTO connection_org_id
  FROM "supplier_connections"
  WHERE "id" = NEW."supplier_connection_id";

  IF offer_org_id IS NULL THEN
    RAISE EXCEPTION 'supplier offer not found for eligibility';
  END IF;

  IF connection_org_id IS NULL THEN
    RAISE EXCEPTION 'supplier connection not found for eligibility';
  END IF;

  IF offer_org_id <> NEW."supplier_organization_id"
     OR connection_org_id <> NEW."supplier_organization_id" THEN
    RAISE EXCEPTION 'supplier offer eligibility organization scope mismatch';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "supplier_offer_eligibilities_scope_guard"
BEFORE INSERT OR UPDATE OF "supplier_offer_id", "supplier_organization_id", "supplier_connection_id"
ON "supplier_offer_eligibilities"
FOR EACH ROW
EXECUTE FUNCTION validate_supplier_offer_eligibility_scope();

CREATE OR REPLACE FUNCTION validate_restricted_supplier_offer_targets()
RETURNS TRIGGER AS $$
DECLARE
  target_offer_id TEXT;
  offer_status TEXT;
  offer_visibility TEXT;
BEGIN
  target_offer_id := COALESCE(NEW."supplier_offer_id", OLD."supplier_offer_id", NEW."id", OLD."id");

  SELECT "status", "visibility_scope"
    INTO offer_status, offer_visibility
  FROM "supplier_offers"
  WHERE "id" = target_offer_id;

  IF offer_status = 'ACTIVE' AND offer_visibility = 'RESTRICTED' AND NOT EXISTS (
    SELECT 1
    FROM "supplier_offer_eligibilities" e
    JOIN "supplier_connections" sc ON sc."id" = e."supplier_connection_id"
    WHERE e."supplier_offer_id" = target_offer_id
      AND sc."status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'active restricted supplier offer requires at least one active eligible connection';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "supplier_offer_eligibilities_restricted_guard"
AFTER INSERT OR UPDATE OR DELETE ON "supplier_offer_eligibilities"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_restricted_supplier_offer_targets();

CREATE CONSTRAINT TRIGGER "supplier_offers_restricted_guard"
AFTER INSERT OR UPDATE OF "status", "visibility_scope" ON "supplier_offers"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_restricted_supplier_offer_targets();
