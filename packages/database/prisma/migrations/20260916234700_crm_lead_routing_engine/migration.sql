BEGIN;

CREATE TABLE crm_lead_routing_rules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100 CHECK(priority BETWEEN 0 AND 10000),
  strategy TEXT NOT NULL CHECK(strategy IN ('ROUND_ROBIN','LEAST_ACTIVE')),
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(conditions)='object'),
  team TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id,company_id,branch_id,name)
);

CREATE INDEX crm_lead_routing_rules_match_idx
  ON crm_lead_routing_rules(tenant_id,company_id,branch_id,enabled,priority,id);

CREATE TABLE crm_lead_routing_targets (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  routing_rule_id TEXT NOT NULL REFERENCES crm_lead_routing_rules(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  assigned_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK(position >= 0),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(routing_rule_id,assigned_user_id),
  UNIQUE(routing_rule_id,position)
);

CREATE INDEX crm_lead_routing_targets_scope_user_idx
  ON crm_lead_routing_targets(tenant_id,company_id,branch_id,assigned_user_id)
  WHERE enabled=TRUE;

CREATE TABLE crm_lead_routing_cursors (
  routing_rule_id TEXT PRIMARY KEY REFERENCES crm_lead_routing_rules(id) ON DELETE CASCADE,
  next_index BIGINT NOT NULL DEFAULT 0 CHECK(next_index >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE crm_lead_routing_rule_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  routing_rule_id TEXT NOT NULL REFERENCES crm_lead_routing_rules(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK(event_type IN ('RULE_CREATED','RULE_UPDATED','TARGETS_REPLACED')),
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metadata)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX crm_lead_routing_rule_events_rule_idx
  ON crm_lead_routing_rule_events(routing_rule_id,created_at,id);

CREATE OR REPLACE FUNCTION validate_crm_lead_routing_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM companies c
    JOIN branches b ON b."companyId"=c.id
    WHERE c.id=NEW.company_id AND c."tenantId"=NEW.tenant_id AND b.id=NEW.branch_id
  ) THEN
    RAISE EXCEPTION 'crm lead routing organization scope mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER crm_lead_routing_rules_scope_guard
BEFORE INSERT OR UPDATE ON crm_lead_routing_rules
FOR EACH ROW EXECUTE FUNCTION validate_crm_lead_routing_scope();

CREATE OR REPLACE FUNCTION validate_crm_lead_routing_target_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM crm_lead_routing_rules r
    WHERE r.id=NEW.routing_rule_id
      AND r.tenant_id=NEW.tenant_id
      AND r.company_id=NEW.company_id
      AND r.branch_id=NEW.branch_id
  ) THEN
    RAISE EXCEPTION 'crm lead routing target scope mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER crm_lead_routing_targets_scope_guard
BEFORE INSERT OR UPDATE ON crm_lead_routing_targets
FOR EACH ROW EXECUTE FUNCTION validate_crm_lead_routing_target_scope();

CREATE OR REPLACE FUNCTION validate_crm_lead_routing_rule_event_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM crm_lead_routing_rules r
    WHERE r.id=NEW.routing_rule_id
      AND r.tenant_id=NEW.tenant_id
      AND r.company_id=NEW.company_id
      AND r.branch_id=NEW.branch_id
  ) THEN
    RAISE EXCEPTION 'crm lead routing rule event scope mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER crm_lead_routing_rule_events_scope_guard
BEFORE INSERT ON crm_lead_routing_rule_events
FOR EACH ROW EXECUTE FUNCTION validate_crm_lead_routing_rule_event_scope();

CREATE OR REPLACE FUNCTION crm_lead_routing_rule_events_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'crm lead routing rule events are append-only';
END;
$$;

CREATE TRIGGER crm_lead_routing_rule_events_append_only_guard
BEFORE UPDATE OR DELETE ON crm_lead_routing_rule_events
FOR EACH ROW EXECUTE FUNCTION crm_lead_routing_rule_events_append_only();

COMMIT;
