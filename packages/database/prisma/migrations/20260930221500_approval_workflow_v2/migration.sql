ALTER TABLE hr_approval_policy_steps
  DROP CONSTRAINT IF EXISTS hr_approval_policy_steps_approver_type_check;

ALTER TABLE hr_approval_policy_steps
  ADD CONSTRAINT hr_approval_policy_steps_approver_type_check
  CHECK (
    approver_type IN (
      'ROLE',
      'MANAGER',
      'DIRECT_MANAGER',
      'BRANCH_MANAGER',
      'REGIONAL_MANAGER',
      'DEPARTMENT_MANAGER',
      'ORGANIZATION_MANAGER',
      'PERMISSION',
      'USER'
    )
  );

ALTER TABLE hr_approval_policy_steps
  ADD COLUMN IF NOT EXISTS sla_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS escalation_approver_type TEXT,
  ADD COLUMN IF NOT EXISTS escalation_approver_value TEXT,
  ADD COLUMN IF NOT EXISTS timeout_action TEXT NOT NULL DEFAULT 'ESCALATE';

ALTER TABLE hr_approval_policy_steps
  ADD CONSTRAINT hr_approval_policy_steps_sla_minutes_check
  CHECK (sla_minutes IS NULL OR sla_minutes > 0);

ALTER TABLE hr_approval_policy_steps
  ADD CONSTRAINT hr_approval_policy_steps_timeout_action_check
  CHECK (timeout_action IN ('ESCALATE','AUTO_APPROVE','AUTO_REJECT','NOTIFY'));

ALTER TABLE hr_approval_instances
  ADD COLUMN IF NOT EXISTS step_started_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS hr_approval_instances_sla_idx
  ON hr_approval_instances(tenant_id,company_id,status,step_started_at,current_step);

UPDATE hr_approval_policy_steps
SET sla_minutes = escalation_hours * 60
WHERE sla_minutes IS NULL
  AND escalation_hours IS NOT NULL;
