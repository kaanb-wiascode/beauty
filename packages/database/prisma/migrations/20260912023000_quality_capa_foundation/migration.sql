BEGIN;

ALTER TABLE quality_findings
  ADD COLUMN IF NOT EXISTS owner_user_id TEXT,
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS resolution_note TEXT;

CREATE INDEX IF NOT EXISTS quality_findings_owner_due_idx
  ON quality_findings(tenant_id, company_id, branch_id, owner_user_id, due_at)
  WHERE status <> 'CLOSED';

DO $$ BEGIN
  ALTER TABLE quality_findings ADD CONSTRAINT quality_findings_owner_fkey FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS quality_capa_plans (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  quality_case_id TEXT NOT NULL,
  finding_id TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  root_cause TEXT NOT NULL,
  corrective_action TEXT NOT NULL,
  preventive_action TEXT,
  owner_user_id TEXT,
  due_at TIMESTAMP(3),
  verification_method TEXT,
  verification_result TEXT,
  verified_by_user_id TEXT,
  verified_at TIMESTAMP(3),
  closed_at TIMESTAMP(3),
  created_by_user_id TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quality_capa_status_chk CHECK (status IN ('OPEN','IN_PROGRESS','VERIFICATION','EFFECTIVE','INEFFECTIVE','CLOSED')) NOT VALID,
  UNIQUE (quality_case_id)
);

CREATE TABLE IF NOT EXISTS quality_capa_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  capa_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_user_id TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quality_capa_event_type_chk CHECK (event_type IN ('CREATED','ASSIGNED','STATUS_CHANGED','VERIFIED','NOTE')) NOT VALID
);

CREATE INDEX IF NOT EXISTS quality_capa_scope_idx ON quality_capa_plans(tenant_id, company_id, branch_id, status, due_at);
CREATE INDEX IF NOT EXISTS quality_capa_events_idx ON quality_capa_events(capa_id, created_at ASC);

ALTER TABLE quality_capa_plans ADD CONSTRAINT quality_capa_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE quality_capa_plans ADD CONSTRAINT quality_capa_company_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_capa_plans ADD CONSTRAINT quality_capa_branch_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_capa_plans ADD CONSTRAINT quality_capa_case_fkey FOREIGN KEY (quality_case_id) REFERENCES quality_cases(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE quality_capa_plans ADD CONSTRAINT quality_capa_finding_fkey FOREIGN KEY (finding_id) REFERENCES quality_findings(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE quality_capa_plans ADD CONSTRAINT quality_capa_owner_fkey FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE quality_capa_plans ADD CONSTRAINT quality_capa_verified_by_fkey FOREIGN KEY (verified_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE quality_capa_plans ADD CONSTRAINT quality_capa_created_by_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_capa_plans ADD CONSTRAINT quality_capa_updated_by_fkey FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE quality_capa_events ADD CONSTRAINT quality_capa_events_capa_fkey FOREIGN KEY (capa_id) REFERENCES quality_capa_plans(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE quality_capa_events ADD CONSTRAINT quality_capa_events_actor_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
