CREATE TABLE IF NOT EXISTS crm_assignment_rules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
  team_id TEXT REFERENCES crm_teams(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('MANUAL','ROUND_ROBIN','LOAD_BALANCED','BRANCH_BASED','SKILL_BASED')),
  source_filter TEXT,
  skill_key TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 100,
  last_assigned_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_assignment_rules_scope_idx
  ON crm_assignment_rules(tenant_id,company_id,branch_id,active,priority);

CREATE TABLE IF NOT EXISTS crm_assignment_history (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  lead_id TEXT NOT NULL,
  rule_id TEXT REFERENCES crm_assignment_rules(id) ON DELETE SET NULL,
  previous_owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  assigned_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assignment_mode TEXT NOT NULL,
  reason TEXT,
  assigned_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_assignment_history_lead_idx
  ON crm_assignment_history(lead_id,created_at DESC);
CREATE INDEX IF NOT EXISTS crm_assignment_history_user_idx
  ON crm_assignment_history(assigned_user_id,created_at DESC);
