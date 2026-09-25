CREATE TABLE operations_appointment_engagement (
  appointment_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  confirmation_status TEXT NOT NULL DEFAULT 'PENDING',
  confirmation_note TEXT,
  confirmed_at TIMESTAMPTZ,
  confirmation_updated_by_membership_id TEXT,
  last_reminder_message_id TEXT,
  last_reminder_sent_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT operations_appointment_engagement_confirmation_check
    CHECK (confirmation_status IN ('PENDING','CONFIRMED','RESCHEDULE_REQUESTED','CANCEL_REQUESTED')),
  CONSTRAINT operations_appointment_engagement_appointment_fkey
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT operations_appointment_engagement_tenant_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT operations_appointment_engagement_company_fkey
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operations_appointment_engagement_branch_fkey
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operations_appointment_engagement_membership_fkey
    FOREIGN KEY (confirmation_updated_by_membership_id) REFERENCES memberships(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX operations_appointment_engagement_scope_status_idx
  ON operations_appointment_engagement(tenant_id, company_id, branch_id, confirmation_status);

CREATE TABLE operations_checkout_followups (
  visit_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  crm_message_id TEXT,
  sent_at TIMESTAMPTZ,
  created_by_membership_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT operations_checkout_followups_visit_fkey
    FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT operations_checkout_followups_tenant_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT operations_checkout_followups_company_fkey
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operations_checkout_followups_branch_fkey
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operations_checkout_followups_customer_fkey
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operations_checkout_followups_membership_fkey
    FOREIGN KEY (created_by_membership_id) REFERENCES memberships(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX operations_checkout_followups_scope_sent_idx
  ON operations_checkout_followups(tenant_id, company_id, branch_id, sent_at);
