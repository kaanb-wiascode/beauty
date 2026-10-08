BEGIN;

CREATE TABLE IF NOT EXISTS customer_feedback (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  appointment_id TEXT,
  service_id TEXT,
  staff_id TEXT,
  care_event_id TEXT,
  source TEXT NOT NULL DEFAULT 'MANUAL',
  classification TEXT NOT NULL DEFAULT 'UNCLASSIFIED',
  overall_rating INTEGER,
  comment TEXT,
  submitted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by_user_id TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT customer_feedback_source_chk CHECK (source IN ('MANUAL','POST_SERVICE','COMPLAINT','CUSTOMER_PORTAL','IMPORT')) NOT VALID,
  CONSTRAINT customer_feedback_classification_chk CHECK (classification IN ('UNCLASSIFIED','POSITIVE','NEUTRAL','NEGATIVE','CRITICAL')) NOT VALID,
  CONSTRAINT customer_feedback_rating_chk CHECK (overall_rating IS NULL OR (overall_rating BETWEEN 1 AND 5)) NOT VALID
);

CREATE INDEX IF NOT EXISTS customer_feedback_scope_idx
  ON customer_feedback(tenant_id, company_id, branch_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS customer_feedback_customer_idx
  ON customer_feedback(tenant_id, company_id, customer_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS customer_feedback_classification_idx
  ON customer_feedback(tenant_id, company_id, classification, submitted_at DESC);

CREATE TABLE IF NOT EXISTS quality_cases (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  feedback_id TEXT,
  care_event_id TEXT,
  customer_id TEXT,
  appointment_id TEXT,
  service_id TEXT,
  staff_id TEXT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'MEDIUM',
  status TEXT NOT NULL DEFAULT 'OPEN',
  title TEXT NOT NULL,
  description TEXT,
  assigned_user_id TEXT,
  sla_due_at TIMESTAMP(3),
  root_cause TEXT,
  corrective_action TEXT,
  preventive_action TEXT,
  resolution TEXT,
  customer_follow_up TEXT,
  opened_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  investigating_at TIMESTAMP(3),
  action_required_at TIMESTAMP(3),
  resolved_at TIMESTAMP(3),
  closed_at TIMESTAMP(3),
  created_by_user_id TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quality_cases_source_chk CHECK (source_type IN ('FEEDBACK','CARE_EVENT','MANUAL','INCIDENT')) NOT VALID,
  CONSTRAINT quality_cases_severity_chk CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')) NOT VALID,
  CONSTRAINT quality_cases_status_chk CHECK (status IN ('OPEN','INVESTIGATING','ACTION_REQUIRED','RESOLVED','CLOSED')) NOT VALID
);

CREATE UNIQUE INDEX IF NOT EXISTS quality_cases_feedback_uq
  ON quality_cases(feedback_id) WHERE feedback_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS quality_cases_scope_status_idx
  ON quality_cases(tenant_id, company_id, branch_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS quality_cases_assignment_idx
  ON quality_cases(tenant_id, company_id, assigned_user_id, status) WHERE assigned_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS quality_cases_sla_idx
  ON quality_cases(tenant_id, company_id, sla_due_at) WHERE status NOT IN ('RESOLVED','CLOSED') AND sla_due_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS quality_case_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  case_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  assigned_user_id TEXT,
  note TEXT,
  actor_user_id TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quality_case_events_type_chk CHECK (event_type IN ('CREATED','ASSIGNED','STATUS_CHANGED','RESOLUTION_UPDATED','NOTE')) NOT VALID
);

CREATE INDEX IF NOT EXISTS quality_case_events_case_idx
  ON quality_case_events(case_id, created_at ASC);
CREATE INDEX IF NOT EXISTS quality_case_events_scope_idx
  ON quality_case_events(tenant_id, company_id, branch_id, created_at DESC);

ALTER TABLE customer_feedback ADD CONSTRAINT customer_feedback_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE customer_feedback ADD CONSTRAINT customer_feedback_company_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE customer_feedback ADD CONSTRAINT customer_feedback_branch_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE customer_feedback ADD CONSTRAINT customer_feedback_customer_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE customer_feedback ADD CONSTRAINT customer_feedback_appointment_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE customer_feedback ADD CONSTRAINT customer_feedback_service_fkey FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE customer_feedback ADD CONSTRAINT customer_feedback_staff_fkey FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE customer_feedback ADD CONSTRAINT customer_feedback_care_event_fkey FOREIGN KEY (care_event_id) REFERENCES customer_care_events(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE customer_feedback ADD CONSTRAINT customer_feedback_created_by_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE quality_cases ADD CONSTRAINT quality_cases_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE quality_cases ADD CONSTRAINT quality_cases_company_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_cases ADD CONSTRAINT quality_cases_branch_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_cases ADD CONSTRAINT quality_cases_feedback_fkey FOREIGN KEY (feedback_id) REFERENCES customer_feedback(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE quality_cases ADD CONSTRAINT quality_cases_care_event_fkey FOREIGN KEY (care_event_id) REFERENCES customer_care_events(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE quality_cases ADD CONSTRAINT quality_cases_customer_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE quality_cases ADD CONSTRAINT quality_cases_appointment_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE quality_cases ADD CONSTRAINT quality_cases_service_fkey FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE quality_cases ADD CONSTRAINT quality_cases_staff_fkey FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE quality_cases ADD CONSTRAINT quality_cases_assigned_user_fkey FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE quality_cases ADD CONSTRAINT quality_cases_created_by_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_cases ADD CONSTRAINT quality_cases_updated_by_fkey FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE quality_case_events ADD CONSTRAINT quality_case_events_case_fkey FOREIGN KEY (case_id) REFERENCES quality_cases(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE quality_case_events ADD CONSTRAINT quality_case_events_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE quality_case_events ADD CONSTRAINT quality_case_events_company_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_case_events ADD CONSTRAINT quality_case_events_branch_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_case_events ADD CONSTRAINT quality_case_events_assigned_user_fkey FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE quality_case_events ADD CONSTRAINT quality_case_events_actor_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
