-- Enforce configured tenant quotas at the database boundary so new mutation
-- paths cannot bypass application-level checks. DEFAULT catalog values are not
-- treated as configured quotas; this preserves unconfigured legacy tenants.

CREATE OR REPLACE FUNCTION platform_effective_configured_integer_quota(
  p_tenant_id TEXT,
  p_entitlement_key TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_value JSONB;
  v_text TEXT;
BEGIN
  WITH current_subscription AS (
    SELECT s.plan_version_id
    FROM platform_tenant_subscriptions s
    WHERE s.tenant_id = p_tenant_id
      AND s.status IN ('TRIAL', 'ACTIVE', 'PAST_DUE')
    ORDER BY s.created_at DESC
    LIMIT 1
  ), active_override AS (
    SELECT o.value
    FROM platform_tenant_entitlement_overrides o
    WHERE o.tenant_id = p_tenant_id
      AND o.entitlement_key = p_entitlement_key
      AND o.status = 'ACTIVE'
      AND o.starts_at <= CURRENT_TIMESTAMP
      AND (o.ends_at IS NULL OR o.ends_at > CURRENT_TIMESTAMP)
    ORDER BY o.starts_at DESC, o.created_at DESC
    LIMIT 1
  )
  SELECT CASE
    WHEN ao.value IS NOT NULL THEN ao.value
    WHEN pe.entitlement_key IS NOT NULL THEN pe.value
    ELSE NULL
  END
  INTO v_value
  FROM platform_entitlements e
  LEFT JOIN current_subscription cs ON TRUE
  LEFT JOIN platform_plan_entitlements pe
    ON pe.plan_version_id = cs.plan_version_id
   AND pe.entitlement_key = e.key
  LEFT JOIN active_override ao ON TRUE
  WHERE e.key = p_entitlement_key
    AND e.status = 'ACTIVE'
    AND e.value_type = 'INTEGER'
  LIMIT 1;

  IF v_value IS NULL OR jsonb_typeof(v_value) <> 'number' THEN
    RETURN NULL;
  END IF;

  v_text := v_value #>> '{}';
  IF v_text !~ '^-?[0-9]+$' THEN
    RETURN NULL;
  END IF;

  RETURN v_text::INTEGER;
EXCEPTION
  WHEN numeric_value_out_of_range THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_tenant_user_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_limit INTEGER;
  v_current INTEGER;
BEGIN
  IF NEW.status <> 'ACTIVE'
     OR (TG_OP = 'UPDATE' AND OLD.status = 'ACTIVE') THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tenant-quota'), hashtext(NEW.tenant_id));

  v_limit := platform_effective_configured_integer_quota(NEW.tenant_id, 'users.limit');
  IF v_limit IS NULL OR v_limit < 0 THEN
    RETURN NEW;
  END IF;

  -- A user who is already active elsewhere in the same tenant does not consume
  -- another seat. The exclusion also makes this safe for UPDATE transitions.
  IF EXISTS (
    SELECT 1
    FROM memberships m
    WHERE m.tenant_id = NEW.tenant_id
      AND m.user_id = NEW.user_id
      AND m.status = 'ACTIVE'
      AND m.id <> NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(DISTINCT m.user_id)::INTEGER
  INTO v_current
  FROM memberships m
  WHERE m.tenant_id = NEW.tenant_id
    AND m.status = 'ACTIVE'
    AND m.id <> NEW.id;

  IF v_current >= v_limit THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'TENANT_QUOTA_EXCEEDED',
      DETAIL = format(
        '{"entitlementKey":"users.limit","limit":%s,"current":%s}',
        v_limit,
        v_current
      );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS memberships_tenant_user_quota_guard ON memberships;
CREATE TRIGGER memberships_tenant_user_quota_guard
BEFORE INSERT OR UPDATE OF status, tenant_id, user_id
ON memberships
FOR EACH ROW
EXECUTE FUNCTION enforce_tenant_user_quota();

CREATE OR REPLACE FUNCTION enforce_tenant_branch_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id TEXT;
  v_limit INTEGER;
  v_current INTEGER;
BEGIN
  IF NEW.status <> 'ACTIVE'
     OR (TG_OP = 'UPDATE' AND OLD.status = 'ACTIVE' AND OLD.company_id = NEW.company_id) THEN
    RETURN NEW;
  END IF;

  SELECT c.tenant_id
  INTO v_tenant_id
  FROM companies c
  WHERE c.id = NEW.company_id;

  IF v_tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tenant-quota'), hashtext(v_tenant_id));

  v_limit := platform_effective_configured_integer_quota(v_tenant_id, 'branches.limit');
  IF v_limit IS NULL OR v_limit < 0 THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_current
  FROM branches b
  INNER JOIN companies c ON c.id = b.company_id
  WHERE c.tenant_id = v_tenant_id
    AND b.status = 'ACTIVE'
    AND b.id <> NEW.id;

  IF v_current >= v_limit THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'TENANT_QUOTA_EXCEEDED',
      DETAIL = format(
        '{"entitlementKey":"branches.limit","limit":%s,"current":%s}',
        v_limit,
        v_current
      );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS branches_tenant_quota_guard ON branches;
CREATE TRIGGER branches_tenant_quota_guard
BEFORE INSERT OR UPDATE OF status, company_id
ON branches
FOR EACH ROW
EXECUTE FUNCTION enforce_tenant_branch_quota();
