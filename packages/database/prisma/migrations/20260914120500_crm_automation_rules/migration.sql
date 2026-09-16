CREATE TABLE crm_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  rule_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_automation_rules_version_check CHECK (version >= 1),
  CONSTRAINT crm_automation_rules_rule_key_check CHECK (
    rule_key IN (
      'LEAD_FIRST_TOUCH',
      'OPPORTUNITY_STAGE_FOLLOW_UP',
      'STALE_OPPORTUNITY_FOLLOW_UP'
    )
  ),
  CONSTRAINT crm_automation_rules_config_object_check CHECK (jsonb_typeof(config) = 'object'),
  UNIQUE (tenant_id, company_id, branch_id, rule_key)
);

CREATE INDEX crm_automation_rules_scope_idx
  ON crm_automation_rules (tenant_id, company_id, branch_id);

CREATE OR REPLACE FUNCTION validate_crm_automation_rule_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM companies c
    JOIN branches b ON b."companyId" = c.id
    WHERE c.id = NEW.company_id
      AND c."tenantId" = NEW.tenant_id
      AND b.id = NEW.branch_id
  ) THEN
    RAISE EXCEPTION 'crm automation rule organization scope mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER crm_automation_rules_scope_guard
BEFORE INSERT OR UPDATE ON crm_automation_rules
FOR EACH ROW EXECUTE FUNCTION validate_crm_automation_rule_scope();

ALTER TABLE crm_events
  ADD COLUMN automation_rule_id UUID REFERENCES crm_automation_rules(id) ON DELETE RESTRICT;

ALTER TABLE crm_events
  DROP CONSTRAINT crm_events_subject_check;

ALTER TABLE crm_events
  ADD CONSTRAINT crm_events_subject_check CHECK (
    num_nonnulls(lead_id, opportunity_id, follow_up_id, automation_rule_id) >= 1
  );

CREATE INDEX crm_events_automation_rule_idx
  ON crm_events(automation_rule_id, created_at)
  WHERE automation_rule_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_crm_automation_rule_event_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.automation_rule_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM crm_automation_rules r
    WHERE r.id = NEW.automation_rule_id
      AND r.tenant_id = NEW.tenant_id
      AND r.company_id = NEW.company_id
      AND r.branch_id = NEW.branch_id
  ) THEN
    RAISE EXCEPTION 'crm automation rule event scope mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER crm_events_automation_rule_scope_guard
BEFORE INSERT ON crm_events
FOR EACH ROW EXECUTE FUNCTION validate_crm_automation_rule_event_scope();
