CREATE TABLE "supplier_network_audit_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "supplier_organization_id" TEXT,
    "inventory_supplier_id" TEXT,
    "connection_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_network_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_network_audit_logs_scope_created_idx"
  ON "supplier_network_audit_logs"("tenant_id", "company_id", "created_at" DESC);
CREATE INDEX "supplier_network_audit_logs_connection_idx"
  ON "supplier_network_audit_logs"("connection_id", "created_at" DESC);

ALTER TABLE "supplier_network_audit_logs"
  ADD CONSTRAINT "supplier_network_audit_logs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_network_audit_logs"
  ADD CONSTRAINT "supplier_network_audit_logs_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION validate_supplier_network_audit_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "companies" c
    WHERE c."id" = NEW."company_id"
      AND c."tenantId" = NEW."tenant_id"
  ) THEN
    RAISE EXCEPTION 'Supplier network audit organization scope mismatch';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER supplier_network_audit_scope_guard
BEFORE INSERT OR UPDATE OF "tenant_id", "company_id"
ON "supplier_network_audit_logs"
FOR EACH ROW
EXECUTE FUNCTION validate_supplier_network_audit_scope();
