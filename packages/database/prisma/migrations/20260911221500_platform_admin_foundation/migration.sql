CREATE TABLE "platform_admin_users" (
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_admin_users_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "platform_admin_users_status_check"
      CHECK ("status" IN ('ACTIVE', 'SUSPENDED'))
);

ALTER TABLE "platform_admin_users"
  ADD CONSTRAINT "platform_admin_users_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "platform_admin_users_status_idx"
  ON "platform_admin_users"("status");

-- Platform administrators are intentionally NOT backfilled from tenant owner roles.
-- Assignment is an explicit operator action until a dedicated platform-admin
-- provisioning workflow is implemented.
