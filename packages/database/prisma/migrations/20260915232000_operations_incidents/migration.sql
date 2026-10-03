CREATE TABLE "operations_incidents" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "title" TEXT NOT NULL,
  "description" TEXT,
  "room_id" TEXT,
  "inventory_asset_id" TEXT,
  "resource_block_id" TEXT,
  "quality_case_id" TEXT,
  "opened_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMPTZ,
  "reported_by_membership_id" TEXT NOT NULL,
  "resolved_by_membership_id" TEXT,
  "resolution_note" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operations_incidents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operations_incidents_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_incidents_company_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_incidents_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_incidents_room_fkey" FOREIGN KEY ("room_id") REFERENCES "operations_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "operations_incidents_asset_fkey" FOREIGN KEY ("inventory_asset_id") REFERENCES "inventory_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "operations_incidents_resource_block_fkey" FOREIGN KEY ("resource_block_id") REFERENCES "operations_resource_blocks"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "operations_incidents_quality_case_fkey" FOREIGN KEY ("quality_case_id") REFERENCES "quality_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "operations_incidents_reported_membership_fkey" FOREIGN KEY ("reported_by_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_incidents_resolved_membership_fkey" FOREIGN KEY ("resolved_by_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_incidents_type_check" CHECK ("type" IN ('DEVICE_FAILURE','ROOM_UNAVAILABLE','POWER','NETWORK','STAFFING','OTHER')),
  CONSTRAINT "operations_incidents_severity_check" CHECK ("severity" IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  CONSTRAINT "operations_incidents_status_check" CHECK ("status" IN ('OPEN','RESOLVED')),
  CONSTRAINT "operations_incidents_resource_check" CHECK (NOT ("room_id" IS NOT NULL AND "inventory_asset_id" IS NOT NULL)),
  CONSTRAINT "operations_incidents_version_check" CHECK ("version" > 0)
);

CREATE INDEX "operations_incidents_scope_status_idx"
  ON "operations_incidents"("tenant_id", "company_id", "branch_id", "status", "severity");
CREATE INDEX "operations_incidents_room_idx" ON "operations_incidents"("room_id") WHERE "room_id" IS NOT NULL;
CREATE INDEX "operations_incidents_asset_idx" ON "operations_incidents"("inventory_asset_id") WHERE "inventory_asset_id" IS NOT NULL;

CREATE TABLE "operations_incident_events" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "incident_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "actor_membership_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operations_incident_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operations_incident_events_incident_fkey" FOREIGN KEY ("incident_id") REFERENCES "operations_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_incident_events_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_incident_events_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_incident_events_membership_fkey" FOREIGN KEY ("actor_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "operations_incident_events_incident_created_idx"
  ON "operations_incident_events"("incident_id", "created_at");
