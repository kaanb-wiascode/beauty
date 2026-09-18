BEGIN;

CREATE TABLE IF NOT EXISTS quality_feedback_requests (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  requested_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP(3),
  opened_at TIMESTAMP(3),
  submitted_at TIMESTAMP(3),
  cancelled_at TIMESTAMP(3),
  expires_at TIMESTAMP(3),
  created_by_user_id TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quality_feedback_requests_status_chk CHECK (status IN ('PENDING','SENT','OPENED','SUBMITTED','CANCELLED')) NOT VALID,
  CONSTRAINT quality_feedback_requests_appointment_uq UNIQUE (appointment_id)
);

CREATE INDEX IF NOT EXISTS quality_feedback_requests_scope_idx
  ON quality_feedback_requests(tenant_id, company_id, branch_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS quality_feedback_requests_customer_idx
  ON quality_feedback_requests(tenant_id, company_id, customer_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS quality_feedback_request_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  feedback_request_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quality_feedback_request_events_type_chk CHECK (event_type IN ('REQUESTED','SENT','OPENED','SUBMITTED','CANCELLED')) NOT VALID
);

CREATE INDEX IF NOT EXISTS quality_feedback_request_events_request_idx
  ON quality_feedback_request_events(feedback_request_id, created_at ASC);
CREATE INDEX IF NOT EXISTS quality_feedback_request_events_scope_idx
  ON quality_feedback_request_events(tenant_id, company_id, branch_id, created_at DESC);

ALTER TABLE quality_feedback_requests ADD CONSTRAINT quality_feedback_requests_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE quality_feedback_requests ADD CONSTRAINT quality_feedback_requests_company_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_feedback_requests ADD CONSTRAINT quality_feedback_requests_branch_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_feedback_requests ADD CONSTRAINT quality_feedback_requests_appointment_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE quality_feedback_requests ADD CONSTRAINT quality_feedback_requests_customer_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_feedback_requests ADD CONSTRAINT quality_feedback_requests_service_fkey FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_feedback_requests ADD CONSTRAINT quality_feedback_requests_created_by_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE quality_feedback_request_events ADD CONSTRAINT quality_feedback_request_events_request_fkey FOREIGN KEY (feedback_request_id) REFERENCES quality_feedback_requests(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE quality_feedback_request_events ADD CONSTRAINT quality_feedback_request_events_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE quality_feedback_request_events ADD CONSTRAINT quality_feedback_request_events_company_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_feedback_request_events ADD CONSTRAINT quality_feedback_request_events_branch_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_feedback_request_events ADD CONSTRAINT quality_feedback_request_events_actor_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
