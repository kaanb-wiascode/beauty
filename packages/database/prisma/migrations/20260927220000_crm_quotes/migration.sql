CREATE TABLE IF NOT EXISTS crm_quotes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  opportunity_id TEXT NOT NULL,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  quote_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SENT','VIEWED','ACCEPTED','REJECTED','EXPIRED','CANCELLED')),
  currency TEXT NOT NULL DEFAULT 'TRY',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  valid_until TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_quotes_scope_number_uq
  ON crm_quotes(tenant_id, company_id, quote_number);
CREATE INDEX IF NOT EXISTS crm_quotes_opportunity_idx
  ON crm_quotes(opportunity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_quotes_customer_idx
  ON crm_quotes(customer_id, created_at DESC) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_quotes_owner_idx
  ON crm_quotes(owner_user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS crm_quote_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  quote_id TEXT NOT NULL REFERENCES crm_quotes(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('SERVICE','PACKAGE','CUSTOM')),
  reference_id TEXT,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(14,2) NOT NULL CHECK (line_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_quote_items_quote_idx ON crm_quote_items(quote_id);
