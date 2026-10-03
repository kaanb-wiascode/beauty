CREATE OR REPLACE FUNCTION assign_owner_communications_permissions()
RETURNS trigger AS $$
BEGIN
  IF NEW.slug = 'owner' THEN
    INSERT INTO role_permissions("roleId", "permissionId")
    SELECT NEW.id, p.id
    FROM permissions p
    WHERE p.resource='communications'
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS owner_communications_permissions_guard ON roles;
CREATE TRIGGER owner_communications_permissions_guard
AFTER INSERT ON roles
FOR EACH ROW EXECUTE FUNCTION assign_owner_communications_permissions();
