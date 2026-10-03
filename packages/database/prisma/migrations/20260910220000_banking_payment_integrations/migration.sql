CREATE TABLE finance_integrations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('OPEN_BANKING','VIRTUAL_POS')),
  provider TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CONNECTED','ERROR','DISCONNECTED')),
  auth_type TEXT NOT NULL DEFAULT 'OAUTH2' CHECK (auth_type IN ('OAUTH2','API_KEY','MANUAL')),
  external_connection_id TEXT,
  consent_expires_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX finance_integrations_company_idx ON finance_integrations(company_id,kind,status);
CREATE UNIQUE INDEX finance_integrations_external_uq ON finance_integrations(provider,external_connection_id) WHERE external_connection_id IS NOT NULL;

CREATE TABLE finance_integration_secrets (
  integration_id TEXT PRIMARY KEY REFERENCES finance_integrations(id) ON DELETE CASCADE,
  encrypted_payload TEXT NOT NULL,
  key_version TEXT NOT NULL DEFAULT 'v1',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bank_accounts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT,
  integration_id TEXT NOT NULL REFERENCES finance_integrations(id) ON DELETE CASCADE,
  external_account_id TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_name TEXT,
  iban_masked TEXT,
  currency TEXT NOT NULL DEFAULT 'TRY',
  available_balance NUMERIC(18,2),
  current_balance NUMERIC(18,2),
  balance_as_of TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(integration_id,external_account_id)
);
CREATE INDEX bank_accounts_company_idx ON bank_accounts(company_id,active);

CREATE TABLE bank_transactions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT,
  bank_account_id TEXT NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  external_transaction_id TEXT NOT NULL,
  booked_at TIMESTAMPTZ NOT NULL,
  value_at TIMESTAMPTZ,
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TRY',
  description TEXT,
  counterparty_name TEXT,
  counterparty_iban_masked TEXT,
  reconciliation_status TEXT NOT NULL DEFAULT 'UNMATCHED' CHECK (reconciliation_status IN ('UNMATCHED','MATCHED','IGNORED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(bank_account_id,external_transaction_id)
);
CREATE INDEX bank_transactions_company_date_idx ON bank_transactions(company_id,booked_at DESC);

CREATE TABLE pos_terminals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT,
  integration_id TEXT NOT NULL REFERENCES finance_integrations(id) ON DELETE CASCADE,
  external_terminal_id TEXT,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TRY',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE pos_transactions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT,
  terminal_id TEXT REFERENCES pos_terminals(id) ON DELETE SET NULL,
  sale_id TEXT,
  sale_payment_id TEXT,
  provider_transaction_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING','AUTHORIZED','CAPTURED','FAILED','REFUNDED','CHARGEBACK')),
  amount NUMERIC(18,2) NOT NULL CHECK (amount >= 0),
  fee_amount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  net_amount NUMERIC(18,2) NOT NULL CHECK (net_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'TRY',
  installment_count INTEGER NOT NULL DEFAULT 1 CHECK (installment_count > 0),
  expected_settlement_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id,provider_transaction_id)
);
CREATE INDEX pos_transactions_settlement_idx ON pos_transactions(company_id,status,expected_settlement_at);

CREATE TABLE pos_settlements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT,
  integration_id TEXT NOT NULL REFERENCES finance_integrations(id) ON DELETE CASCADE,
  bank_account_id TEXT REFERENCES bank_accounts(id) ON DELETE SET NULL,
  provider_settlement_id TEXT NOT NULL,
  gross_amount NUMERIC(18,2) NOT NULL,
  fee_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TRY',
  settled_at TIMESTAMPTZ NOT NULL,
  reconciliation_status TEXT NOT NULL DEFAULT 'UNMATCHED' CHECK (reconciliation_status IN ('UNMATCHED','MATCHED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(integration_id,provider_settlement_id)
);
