-- Finance 2.0 segregation-of-duties permissions.
INSERT INTO permissions(id,resource,action,description)
VALUES
  ('f2000000-0000-4000-8000-000000000001','accounting_journal','create','Yevmiye kaydı oluşturma ve onaya gönderme'),
  ('f2000000-0000-4000-8000-000000000002','accounting_journal','approve','Yevmiye kaydı onaylama'),
  ('f2000000-0000-4000-8000-000000000003','accounting_journal','post','Onaylanmış yevmiye kaydını muhasebeleştirme'),
  ('f2000000-0000-4000-8000-000000000004','finance_period','close','Finansal dönem kapatma'),
  ('f2000000-0000-4000-8000-000000000005','finance_period','reopen','Finansal dönemi yeniden açma')
ON CONFLICT(resource,action) DO UPDATE SET description=EXCLUDED.description;

-- Owners keep full financial governance rights.
INSERT INTO role_permissions("roleId","permissionId")
SELECT r.id,p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.slug='owner'
  AND (
    (p.resource='accounting_journal' AND p.action IN ('create','approve','post'))
    OR (p.resource='finance_period' AND p.action IN ('close','reopen'))
  )
ON CONFLICT DO NOTHING;

-- Accounting managers can create, approve and post journals and manage periods.
INSERT INTO role_permissions("roleId","permissionId")
SELECT r.id,p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.slug='accounting-manager'
  AND (
    (p.resource='accounting_journal' AND p.action IN ('create','approve','post'))
    OR (p.resource='finance_period' AND p.action IN ('close','reopen'))
  )
ON CONFLICT DO NOTHING;

-- Accounting specialists prepare and submit journals, but cannot approve/post or close periods.
INSERT INTO role_permissions("roleId","permissionId")
SELECT r.id,p.id
FROM roles r
JOIN permissions p ON p.resource='accounting_journal' AND p.action='create'
WHERE r.slug='accounting-specialist'
ON CONFLICT DO NOTHING;

-- Backward compatibility for custom roles: accounting.manage grants journal creation only.
INSERT INTO role_permissions("roleId","permissionId")
SELECT DISTINCT rp."roleId",target.id
FROM role_permissions rp
JOIN permissions current_permission ON current_permission.id=rp."permissionId"
JOIN permissions target ON target.resource='accounting_journal' AND target.action='create'
WHERE current_permission.resource='accounting' AND current_permission.action='manage'
ON CONFLICT DO NOTHING;
