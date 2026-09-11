CREATE TABLE supplier_invitations (
  id UUID PRIMARY KEY,
  supplier_organization_id UUID NOT NULL REFERENCES supplier_organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING',
  invited_by_user_id UUID NOT NULL REFERENCES users(id),
  accepted_by_user_id UUID REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT supplier_invitations_role_check CHECK (role IN ('OWNER','ADMIN','MEMBER')),
  CONSTRAINT supplier_invitations_status_check CHECK (status IN ('PENDING','ACCEPTED','REVOKED','EXPIRED'))
);

CREATE UNIQUE INDEX supplier_invitations_one_pending_email
  ON supplier_invitations(supplier_organization_id, lower(email))
  WHERE status='PENDING';

CREATE INDEX supplier_invitations_org_idx
  ON supplier_invitations(supplier_organization_id, created_at DESC);

CREATE TABLE supplier_invitation_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  supplier_invitation_id UUID NOT NULL REFERENCES supplier_invitations(id) ON DELETE CASCADE,
  supplier_organization_id UUID NOT NULL REFERENCES supplier_organizations(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  target_email_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX supplier_invitation_audit_org_idx
  ON supplier_invitation_audit_logs(supplier_organization_id, created_at DESC);
