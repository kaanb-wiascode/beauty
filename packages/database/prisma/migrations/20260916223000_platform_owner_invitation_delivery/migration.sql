-- Platform owner invitation delivery orchestration.
-- Delivery requests never persist raw invitation tokens. A delivery adapter must
-- mint a token at send time and persist only its SHA-256 hash in user_invitations.

ALTER TABLE platform_provisioning_runs
  ADD COLUMN IF NOT EXISTS owner_email TEXT;

CREATE TABLE platform_owner_invitation_deliveries (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  provisioning_run_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  email TEXT NOT NULL,
  branch_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'PENDING',
  invitation_id TEXT,
  delivery_provider TEXT,
  provider_message_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_until TIMESTAMP(3),
  last_error TEXT,
  created_by_platform_user_id TEXT NOT NULL,
  correlation_id TEXT,
  sent_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT platform_owner_invitation_deliveries_run_uq UNIQUE (provisioning_run_id),
  CONSTRAINT platform_owner_invitation_deliveries_status_chk
    CHECK (status IN ('PENDING','CLAIMED','RETRY','SENT','DEAD','CANCELLED')),
  CONSTRAINT platform_owner_invitation_deliveries_attempt_chk
    CHECK (attempt_count >= 0 AND attempt_count <= 10),
  CONSTRAINT platform_owner_invitation_deliveries_run_fk
    FOREIGN KEY (provisioning_run_id) REFERENCES platform_provisioning_runs(id)
    ON DELETE CASCADE,
  CONSTRAINT platform_owner_invitation_deliveries_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    ON DELETE CASCADE,
  CONSTRAINT platform_owner_invitation_deliveries_company_fk
    FOREIGN KEY (company_id) REFERENCES companies(id)
    ON DELETE CASCADE,
  CONSTRAINT platform_owner_invitation_deliveries_role_fk
    FOREIGN KEY (role_id) REFERENCES roles(id)
    ON DELETE RESTRICT,
  CONSTRAINT platform_owner_invitation_deliveries_invitation_fk
    FOREIGN KEY (invitation_id) REFERENCES user_invitations(id)
    ON DELETE SET NULL,
  CONSTRAINT platform_owner_invitation_deliveries_platform_actor_fk
    FOREIGN KEY (created_by_platform_user_id) REFERENCES platform_admin_users(user_id)
    ON DELETE RESTRICT
);

CREATE INDEX platform_owner_invitation_deliveries_dispatch_idx
  ON platform_owner_invitation_deliveries(status, next_attempt_at, created_at);

CREATE INDEX platform_owner_invitation_deliveries_tenant_idx
  ON platform_owner_invitation_deliveries(tenant_id, created_at DESC);

CREATE INDEX platform_owner_invitation_deliveries_email_idx
  ON platform_owner_invitation_deliveries(email, status);
