CREATE TABLE crm_automation_scheduler_leases (
  lease_key TEXT PRIMARY KEY,
  owner_token TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX crm_events_automation_key_unique
ON crm_events (
  tenant_id,
  company_id,
  branch_id,
  (metadata->>'automationKey')
)
WHERE event_type = 'AUTOMATION_EXECUTED'
  AND metadata ? 'automationKey';
