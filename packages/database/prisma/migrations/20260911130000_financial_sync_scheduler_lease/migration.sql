CREATE TABLE finance_scheduler_leases (
  lease_key TEXT PRIMARY KEY,
  owner_token TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at > acquired_at)
);

CREATE INDEX finance_scheduler_leases_expiry_idx
  ON finance_scheduler_leases(expires_at);
