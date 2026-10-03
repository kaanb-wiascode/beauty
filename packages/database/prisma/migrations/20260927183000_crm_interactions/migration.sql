CREATE TABLE IF NOT EXISTS crm_interactions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  lead_id TEXT,
  opportunity_id TEXT,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('CALL','WHATSAPP','SMS','EMAIL','IN_PERSON','VIDEO_CALL','OTHER')),
  direction TEXT NOT NULL CHECK (direction IN ('INBOUND','OUTBOUND')),
  status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PLANNED','COMPLETED','CANCELLED')),
  result TEXT,
  notes TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  next_action TEXT,
  next_action_at TIMESTAMPTZ,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  CHECK (lead_id IS NOT NULL OR opportunity_id IS NOT NULL OR customer_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS crm_interactions_scope_idx
  ON crm_interactions(tenant_id, company_id, branch_id, started_at DESC);
CREATE INDEX IF NOT EXISTS crm_interactions_owner_idx
  ON crm_interactions(owner_user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS crm_interactions_lead_idx
  ON crm_interactions(lead_id, started_at DESC) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_interactions_opportunity_idx
  ON crm_interactions(opportunity_id, started_at DESC) WHERE opportunity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_interactions_customer_idx
  ON crm_interactions(customer_id, started_at DESC) WHERE customer_id IS NOT NULL;
