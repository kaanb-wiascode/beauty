CREATE TABLE management_finance_actions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
  source_code TEXT,
  source_type TEXT,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED')),
  assigned_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (completed_at IS NULL OR status='COMPLETED')
);

CREATE INDEX management_finance_actions_company_status_idx
  ON management_finance_actions(company_id,status,due_at);
CREATE INDEX management_finance_actions_branch_status_idx
  ON management_finance_actions(branch_id,status,due_at)
  WHERE branch_id IS NOT NULL;
CREATE INDEX management_finance_actions_assignee_idx
  ON management_finance_actions(assigned_user_id,status)
  WHERE assigned_user_id IS NOT NULL;
