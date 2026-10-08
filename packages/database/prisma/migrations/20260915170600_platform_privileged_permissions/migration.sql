INSERT INTO "platform_permissions" ("resource", "action", "description")
VALUES
  ('privileged_operations', 'read', 'View privileged operation requests and decisions'),
  ('privileged_operations', 'manage', 'Request and approve privileged platform operations')
ON CONFLICT ("resource", "action") DO NOTHING;

INSERT INTO "platform_role_permissions" ("role_slug", "resource", "action")
VALUES
  ('PLATFORM_OWNER', 'privileged_operations', 'read'),
  ('PLATFORM_OWNER', 'privileged_operations', 'manage'),
  ('PLATFORM_ADMIN', 'privileged_operations', 'read'),
  ('PLATFORM_AUDITOR', 'privileged_operations', 'read')
ON CONFLICT ("role_slug", "resource", "action") DO NOTHING;
