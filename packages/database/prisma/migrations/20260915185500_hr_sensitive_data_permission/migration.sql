-- Introduce a dedicated permission for highly sensitive HR data.
-- Existing hr:read remains sufficient for operational Employee 360 data,
-- while identity, banking and compensation details require hr_sensitive:read.

INSERT INTO permissions (id, resource, action, description, "createdAt")
SELECT
  'perm_hr_sensitive_read',
  'hr_sensitive',
  'read',
  'Read sensitive HR identity, banking and compensation data',
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM permissions
  WHERE resource = 'hr_sensitive' AND action = 'read'
);

-- Preserve full access for existing Owner roles. Other roles must be granted
-- this permission explicitly through role management.
INSERT INTO role_permissions ("roleId", "permissionId")
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.resource = 'hr_sensitive' AND p.action = 'read'
WHERE r.slug = 'owner'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
