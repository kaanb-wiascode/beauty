-- Preserve existing tenant behavior while entitlement enforcement is rolled out.
-- Only tenants with no subscription history are attached to this compatibility plan.
INSERT INTO "platform_plans" ("code", "name", "description", "status")
VALUES (
  'LEGACY_COMPAT',
  'Legacy Compatibility',
  'Compatibility plan for tenants created before platform subscriptions and entitlement enforcement.',
  'ACTIVE'
)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "platform_plan_versions" (
  "plan_id", "version", "currency", "monthly_price", "annual_price",
  "branch_limit", "user_limit", "effective_from", "status"
)
SELECT
  p.id, 1, 'TRY', NULL, NULL, NULL, NULL, CURRENT_TIMESTAMP, 'ACTIVE'
FROM "platform_plans" p
WHERE p.code = 'LEGACY_COMPAT'
  AND NOT EXISTS (
    SELECT 1
    FROM "platform_plan_versions" pv
    WHERE pv.plan_id = p.id AND pv.version = 1
  );

INSERT INTO "platform_plan_entitlements" (
  "plan_version_id", "entitlement_key", "value"
)
SELECT pv.id, values_to_seed.entitlement_key, values_to_seed.value
FROM "platform_plan_versions" pv
INNER JOIN "platform_plans" p ON p.id = pv.plan_id
CROSS JOIN (
  VALUES
    ('crm.enabled'::text, 'true'::jsonb),
    ('finance.enabled'::text, 'true'::jsonb),
    ('hr.enabled'::text, 'true'::jsonb)
) AS values_to_seed(entitlement_key, value)
WHERE p.code = 'LEGACY_COMPAT' AND pv.version = 1
ON CONFLICT ("plan_version_id", "entitlement_key") DO NOTHING;

INSERT INTO "platform_tenant_subscriptions" (
  "tenant_id", "plan_version_id", "status", "currency",
  "contracted_monthly_price", "contracted_annual_price", "discount_percent",
  "starts_at", "version", "created_at", "updated_at"
)
SELECT
  t.id,
  pv.id,
  'ACTIVE',
  'TRY',
  NULL,
  NULL,
  0,
  CURRENT_TIMESTAMP,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "tenants" t
CROSS JOIN "platform_plan_versions" pv
INNER JOIN "platform_plans" p ON p.id = pv.plan_id
WHERE p.code = 'LEGACY_COMPAT'
  AND pv.version = 1
  AND NOT EXISTS (
    SELECT 1
    FROM "platform_tenant_subscriptions" existing
    WHERE existing.tenant_id = t.id
  );
