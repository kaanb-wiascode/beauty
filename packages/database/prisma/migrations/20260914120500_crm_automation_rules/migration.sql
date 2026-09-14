CREATE TABLE crm_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  rule_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  created_by_user_id TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
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
