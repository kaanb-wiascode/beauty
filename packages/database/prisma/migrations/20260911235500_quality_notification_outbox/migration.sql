BEGIN;

CREATE TABLE IF NOT EXISTS quality_notification_outbox (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  feedback_request_id TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL,
  notification_type TEXT NOT NULL DEFAULT 'FEEDBACK_REQUEST',
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_until TIMESTAMP(3),
  claim_token_hash TEXT,
  claimed_by_user_id TEXT,
  provider_message_id TEXT,
  last_error_code TEXT,
  sent_at TIMESTAMP(3),
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quality_notification_outbox_type_chk CHECK (notification_type IN ('FEEDBACK_REQUEST')) NOT VALID,
  CONSTRAINT quality_notification_outbox_status_chk CHECK (status IN ('PENDING','CLAIMED','RETRY','SENT','DEAD','CANCELLED')) NOT VALID,
  CONSTRAINT quality_notification_outbox_attempt_chk CHECK (attempt_count >= 0 AND attempt_count <= 5) NOT VALID
);

CREATE INDEX IF NOT EXISTS quality_notification_outbox_delivery_idx
  ON quality_notification_outbox(tenant_id, company_id, status, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS quality_notification_outbox_branch_idx
  ON quality_notification_outbox(tenant_id, company_id, branch_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS quality_notification_outbox_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  outbox_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  attempt_number INTEGER,
  error_code TEXT,
  actor_user_id TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quality_notification_outbox_events_type_chk CHECK (event_type IN ('ENQUEUED','CLAIMED','SENT','FAILED','DEAD','CANCELLED')) NOT VALID
);

CREATE INDEX IF NOT EXISTS quality_notification_outbox_events_outbox_idx
  ON quality_notification_outbox_events(outbox_id, created_at ASC);

ALTER TABLE quality_notification_outbox ADD CONSTRAINT quality_notification_outbox_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE quality_notification_outbox ADD CONSTRAINT quality_notification_outbox_company_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_notification_outbox ADD CONSTRAINT quality_notification_outbox_branch_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_notification_outbox ADD CONSTRAINT quality_notification_outbox_feedback_request_fkey FOREIGN KEY (feedback_request_id) REFERENCES quality_feedback_requests(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE quality_notification_outbox ADD CONSTRAINT quality_notification_outbox_customer_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_notification_outbox ADD CONSTRAINT quality_notification_outbox_claimed_by_fkey FOREIGN KEY (claimed_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE quality_notification_outbox ADD CONSTRAINT quality_notification_outbox_created_by_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE quality_notification_outbox_events ADD CONSTRAINT quality_notification_outbox_events_outbox_fkey FOREIGN KEY (outbox_id) REFERENCES quality_notification_outbox(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE quality_notification_outbox_events ADD CONSTRAINT quality_notification_outbox_events_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE quality_notification_outbox_events ADD CONSTRAINT quality_notification_outbox_events_company_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_notification_outbox_events ADD CONSTRAINT quality_notification_outbox_events_branch_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_notification_outbox_events ADD CONSTRAINT quality_notification_outbox_events_actor_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
