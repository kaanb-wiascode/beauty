CREATE TABLE IF NOT EXISTS hr_shift_swap_requests (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
 requester_staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
 requester_assignment_id TEXT NOT NULL REFERENCES hr_shift_assignments(id) ON DELETE CASCADE,
 target_staff_id TEXT REFERENCES staff(id) ON DELETE RESTRICT,
 target_assignment_id TEXT REFERENCES hr_shift_assignments(id) ON DELETE SET NULL,
 status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN('OPEN','ACCEPTED','APPROVED','REJECTED','CANCELLED')),
 requester_note TEXT,
 target_note TEXT,
 manager_note TEXT,
 accepted_at TIMESTAMP(3),
 accepted_by TEXT,
 reviewed_at TIMESTAMP(3),
 reviewed_by TEXT,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS hr_shift_swap_active_assignment_uq ON hr_shift_swap_requests(requester_assignment_id) WHERE status IN('OPEN','ACCEPTED');
CREATE INDEX IF NOT EXISTS hr_shift_swap_scope_idx ON hr_shift_swap_requests(tenant_id,company_id,branch_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS hr_open_shift_bids (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
 scheduled_shift_id TEXT NOT NULL REFERENCES hr_scheduled_shifts(id) ON DELETE CASCADE,
 staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','APPROVED','REJECTED','WITHDRAWN')),
 note TEXT,
 reviewed_at TIMESTAMP(3),
 reviewed_by TEXT,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS hr_open_shift_bid_active_uq ON hr_open_shift_bids(scheduled_shift_id,staff_id) WHERE status='PENDING';
CREATE INDEX IF NOT EXISTS hr_open_shift_bid_scope_idx ON hr_open_shift_bids(tenant_id,company_id,branch_id,scheduled_shift_id,status);
