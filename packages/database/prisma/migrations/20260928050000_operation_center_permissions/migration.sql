-- Operation Center domain-specific permissions.
-- Existing role grants are copied from the legacy borrowed permissions so this
-- migration does not unexpectedly revoke access.

WITH desired(resource, action, description) AS (
  VALUES
    ('sales','read','Satış ve tahsilat kayıtlarını görüntüleme'),
    ('sales','create','Satış oluşturma'),
    ('sales','confirm','Satışı onaylama'),
    ('sales','cancel','Taslak satışı iptal etme'),
    ('sales','collect','Satış tahsilatı alma'),
    ('sales','refund','Satış tahsilatını iade etme'),
    ('sessions','read','Paket seanslarını görüntüleme'),
    ('sessions','reserve','Seansı randevuya ayırma'),
    ('sessions','release','Seans rezervasyonunu kaldırma'),
    ('sessions','consume','Seansı kullanılmış olarak işaretleme'),
    ('sessions','cancel','Seansı iptal etme')
)
INSERT INTO "permissions" ("id","resource","action","description","createdAt")
SELECT gen_random_uuid()::text, resource, action, description, CURRENT_TIMESTAMP
FROM desired
ON CONFLICT ("resource","action")
DO UPDATE SET "description" = EXCLUDED."description";

WITH permission_map(new_resource,new_action,old_resource,old_action) AS (
  VALUES
    ('sales','read','payments','read'),
    ('sales','create','payments','create'),
    ('sales','confirm','payments','create'),
    ('sales','cancel','payments','create'),
    ('sales','collect','payments','create'),
    ('sales','refund','payments','refund'),
    ('sessions','read','appointments','read'),
    ('sessions','reserve','appointments','update'),
    ('sessions','release','appointments','update'),
    ('sessions','consume','appointments','update'),
    ('sessions','cancel','appointments','cancel')
)
INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT DISTINCT rp."roleId", new_permission."id"
FROM permission_map mapping
JOIN "permissions" old_permission
  ON old_permission."resource" = mapping.old_resource
 AND old_permission."action" = mapping.old_action
JOIN "role_permissions" rp
  ON rp."permissionId" = old_permission."id"
JOIN "permissions" new_permission
  ON new_permission."resource" = mapping.new_resource
 AND new_permission."action" = mapping.new_action
ON CONFLICT ("roleId","permissionId") DO NOTHING;
