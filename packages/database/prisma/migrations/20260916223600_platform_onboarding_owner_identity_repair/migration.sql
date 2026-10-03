-- Repair historical Platform onboarding rows that may have captured the
-- provisioning Platform operator as owner_user_id before Owner acceptance was
-- derived from tenant identity state.

UPDATE platform_tenant_onboarding o
SET owner_user_id = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE owner_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM memberships m
    JOIN roles r
      ON r.id = m."roleId"
     AND r."tenantId" = o.tenant_id
     AND r.slug = 'owner'
     AND r.scope = 'CENTRAL'
    WHERE m."tenantId" = o.tenant_id
      AND m."userId" = o.owner_user_id
      AND m.status = 'ACTIVE'
  );

UPDATE platform_tenant_onboarding_items i
SET status = 'PENDING',
    completed_by_user_id = NULL,
    completed_at = NULL,
    notes = CASE
      WHEN notes = 'Automatically completed after the primary Owner accepted the provisioning invitation.'
        THEN notes
      ELSE NULL
    END,
    updated_at = CURRENT_TIMESTAMP
FROM platform_tenant_onboarding o
WHERE o.id = i.onboarding_id
  AND i.item_key = 'OWNER_ACCESS'
  AND i.status IN ('COMPLETED','SKIPPED')
  AND NOT EXISTS (
    SELECT 1
    FROM memberships m
    JOIN roles r
      ON r.id = m."roleId"
     AND r."tenantId" = o.tenant_id
     AND r.slug = 'owner'
     AND r.scope = 'CENTRAL'
    WHERE m."tenantId" = o.tenant_id
      AND m."userId" = o.owner_user_id
      AND m.status = 'ACTIVE'
  );

UPDATE platform_tenant_onboarding o
SET status = CASE
      WHEN EXISTS (
        SELECT 1 FROM platform_tenant_onboarding_items i
        WHERE i.onboarding_id = o.id AND i.status = 'BLOCKED'
      ) THEN 'BLOCKED'
      WHEN NOT EXISTS (
        SELECT 1 FROM platform_tenant_onboarding_items i
        WHERE i.onboarding_id = o.id
          AND i.required = TRUE
          AND i.status <> 'COMPLETED'
      ) THEN 'READY_FOR_GO_LIVE'
      ELSE 'IN_PROGRESS'
    END,
    updated_at = CURRENT_TIMESTAMP
WHERE o.status <> 'COMPLETED';
