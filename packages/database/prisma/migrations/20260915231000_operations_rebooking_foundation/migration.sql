ALTER TABLE service_operational_requirements
ADD COLUMN recommended_rebooking_interval_days INTEGER;

ALTER TABLE service_operational_requirements
ADD CONSTRAINT service_operational_requirements_rebooking_interval_check
CHECK (
  recommended_rebooking_interval_days IS NULL
  OR recommended_rebooking_interval_days BETWEEN 1 AND 730
);

CREATE TABLE operations_rebookings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  source_appointment_id TEXT NOT NULL,
  target_appointment_id TEXT NOT NULL,
  source_staff_id TEXT,
  target_staff_id TEXT NOT NULL,
  recommended_interval_days INTEGER,
  recommended_start_at TIMESTAMPTZ,
  actual_start_at TIMESTAMPTZ NOT NULL,
  created_by_membership_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT operations_rebookings_tenant_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT operations_rebookings_company_fkey
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operations_rebookings_branch_fkey
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operations_rebookings_customer_fkey
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operations_rebookings_service_fkey
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operations_rebookings_source_appointment_fkey
    FOREIGN KEY (source_appointment_id) REFERENCES appointments(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operations_rebookings_target_appointment_fkey
    FOREIGN KEY (target_appointment_id) REFERENCES appointments(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operations_rebookings_source_staff_fkey
    FOREIGN KEY (source_staff_id) REFERENCES staff(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT operations_rebookings_target_staff_fkey
    FOREIGN KEY (target_staff_id) REFERENCES staff(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operations_rebookings_membership_fkey
    FOREIGN KEY (created_by_membership_id) REFERENCES memberships(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operations_rebookings_distinct_appointments_check
    CHECK (source_appointment_id <> target_appointment_id)
);

CREATE UNIQUE INDEX operations_rebookings_source_appointment_key
  ON operations_rebookings(source_appointment_id);
CREATE UNIQUE INDEX operations_rebookings_target_appointment_key
  ON operations_rebookings(target_appointment_id);
CREATE INDEX operations_rebookings_customer_created_idx
  ON operations_rebookings(tenant_id, branch_id, customer_id, created_at DESC);
CREATE INDEX operations_rebookings_service_created_idx
  ON operations_rebookings(tenant_id, branch_id, service_id, created_at DESC);
