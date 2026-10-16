INSERT INTO role_permissions ("roleId","permissionId")
SELECT r.id,p.id
FROM roles r
JOIN permissions p ON p.resource='payments' AND p.action='create'
WHERE r.slug IN ('accounting-manager','accountant')
ON CONFLICT DO NOTHING;
