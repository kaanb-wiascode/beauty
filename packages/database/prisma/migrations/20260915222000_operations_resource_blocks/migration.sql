CREATE TABLE "operations_resource_blocks" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "room_id" TEXT,
  "inventory_asset_id" TEXT,
  "blocked_from" TIMESTAMPTZ NOT NULL,
  "blocked_to" TIMESTAMPTZ NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by_membership_id" TEXT NOT NULL,
  "cancelled_by_membership_id" TEXT,
  "cancelled_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "operations_resource_blocks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operations_resource_blocks_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_resource_blocks_company_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_resource_blocks_branch_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_resource_blocks_room_fkey"
    FOREIGN KEY ("room_id") REFERENCES "operations_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_resource_blocks_asset_fkey"
    FOREIGN KEY ("inventory_asset_id") REFERENCES "inventory_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "operations_resource_blocks_created_membership_fkey"
    FOREIGN KEY ("created_by_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_resource_blocks_cancelled_membership_fkey"
    FOREIGN KEY ("cancelled_by_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operations_resource_blocks_exactly_one_resource_check"
    CHECK (("room_id" IS NOT NULL) <> ("inventory_asset_id" IS NOT NULL)),
  CONSTRAINT "operations_resource_blocks_time_check"
    CHECK ("blocked_from" < "blocked_to"),
  CONSTRAINT "operations_resource_blocks_status_check"
    CHECK ("status" IN ('ACTIVE', 'CANCELLED'))
);

CREATE INDEX "operations_resource_blocks_room_window_idx"
  ON "operations_resource_blocks"("room_id", "blocked_from", "blocked_to")
  WHERE "status" = 'ACTIVE' AND "room_id" IS NOT NULL;

CREATE INDEX "operations_resource_blocks_asset_window_idx"
  ON "operations_resource_blocks"("inventory_asset_id", "blocked_from", "blocked_to")
  WHERE "status" = 'ACTIVE' AND "inventory_asset_id" IS NOT NULL;

CREATE INDEX "operations_resource_blocks_branch_window_idx"
  ON "operations_resource_blocks"("tenant_id", "company_id", "branch_id", "blocked_from", "blocked_to")
  WHERE "status" = 'ACTIVE';
