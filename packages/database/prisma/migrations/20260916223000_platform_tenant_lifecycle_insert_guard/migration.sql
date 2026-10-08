-- Every tenant must have an independent provider-owned lifecycle row, including
-- tenants created after the original lifecycle foundation migration.
CREATE OR REPLACE FUNCTION ensure_platform_tenant_lifecycle_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO platform_tenant_lifecycle (tenant_id, state)
  VALUES (NEW.id, 'ACTIVE')
  ON CONFLICT (tenant_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_platform_lifecycle_insert_guard ON tenants;
CREATE TRIGGER tenants_platform_lifecycle_insert_guard
AFTER INSERT ON tenants
FOR EACH ROW
EXECUTE FUNCTION ensure_platform_tenant_lifecycle_on_insert();

INSERT INTO platform_tenant_lifecycle (tenant_id, state)
SELECT t.id, 'ACTIVE'
FROM tenants t
LEFT JOIN platform_tenant_lifecycle l ON l.tenant_id = t.id
WHERE l.tenant_id IS NULL
ON CONFLICT (tenant_id) DO NOTHING;
