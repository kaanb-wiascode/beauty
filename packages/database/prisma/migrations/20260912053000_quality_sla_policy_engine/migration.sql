BEGIN;

CREATE TABLE IF NOT EXISTS quality_sla_policies (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  category TEXT,
  source_type TEXT,
  severity TEXT NOT NULL,
  due_minutes INTEGER NOT NULL,
  escalation_2_minutes INTEGER,
  escalation_3_minutes INTEGER,
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  effective_to TIMESTAMP(3),
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quality_sla_policy_severity_chk CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')) NOT VALID,
  CONSTRAINT quality_sla_policy_source_chk CHECK (source_type IS NULL OR source_type IN ('FEEDBACK','CARE_EVENT','MANUAL','INCIDENT')) NOT VALID,
  CONSTRAINT quality_sla_policy_due_chk CHECK (due_minutes > 0) NOT VALID,
  CONSTRAINT quality_sla_policy_escalation_2_chk CHECK (escalation_2_minutes IS NULL OR escalation_2_minutes >= 0) NOT VALID,
  CONSTRAINT quality_sla_policy_escalation_3_chk CHECK (escalation_3_minutes IS NULL OR escalation_3_minutes >= COALESCE(escalation_2_minutes,0)) NOT VALID,
  CONSTRAINT quality_sla_policy_effective_chk CHECK (effective_to IS NULL OR effective_to > effective_from) NOT VALID,
  UNIQUE (tenant_id, company_id, name, version)
);

CREATE INDEX IF NOT EXISTS quality_sla_policies_match_idx
  ON quality_sla_policies(tenant_id, company_id, severity, is_active, priority, effective_from DESC);

ALTER TABLE quality_cases
  ADD COLUMN IF NOT EXISTS sla_policy_id TEXT,
  ADD COLUMN IF NOT EXISTS sla_policy_version INTEGER,
  ADD COLUMN IF NOT EXISTS sla_policy_applied_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS sla_escalation_2_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS sla_escalation_3_at TIMESTAMP(3);

ALTER TABLE quality_case_events
  DROP CONSTRAINT IF EXISTS quality_case_events_type_chk;

ALTER TABLE quality_case_events
  ADD CONSTRAINT quality_case_events_type_chk
  CHECK (event_type IN ('CREATED','ASSIGNED','STATUS_CHANGED','RESOLUTION_UPDATED','NOTE','SLA_BREACHED','SLA_POLICY_APPLIED','SLA_ESCALATED')) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS quality_case_events_sla_policy_uq
  ON quality_case_events(case_id)
  WHERE event_type='SLA_POLICY_APPLIED';

CREATE UNIQUE INDEX IF NOT EXISTS quality_case_events_sla_escalation_level_uq
  ON quality_case_events(case_id, note)
  WHERE event_type='SLA_ESCALATED';

ALTER TABLE quality_sla_policies
  ADD CONSTRAINT quality_sla_policies_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT quality_sla_policies_company_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT quality_sla_policies_created_by_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE quality_cases
  ADD CONSTRAINT quality_cases_sla_policy_fkey FOREIGN KEY (sla_policy_id) REFERENCES quality_sla_policies(id) ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
