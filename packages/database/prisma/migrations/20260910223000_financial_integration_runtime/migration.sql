CREATE TABLE "finance_integration_auth_sessions" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "integration_id" TEXT NOT NULL,
  "state_hash" TEXT NOT NULL,
  "callback_url" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "consumed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "finance_integration_auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "finance_integration_auth_sessions_state_key"
  ON "finance_integration_auth_sessions"("state_hash");
CREATE INDEX "finance_integration_auth_sessions_integration_idx"
  ON "finance_integration_auth_sessions"("integration_id", "expires_at");

ALTER TABLE "finance_integration_auth_sessions"
  ADD CONSTRAINT "finance_integration_auth_sessions_integration_fkey"
  FOREIGN KEY ("integration_id") REFERENCES "finance_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "finance_integration_sync_runs" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "integration_id" TEXT NOT NULL,
  "sync_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completed_at" TIMESTAMPTZ,
  "records_synced" INTEGER NOT NULL DEFAULT 0,
  "error_message" TEXT,
  CONSTRAINT "finance_integration_sync_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "finance_integration_sync_runs_type_check" CHECK ("sync_type" IN ('ACCOUNTS','BALANCES','TRANSACTIONS','POS','FULL')),
  CONSTRAINT "finance_integration_sync_runs_status_check" CHECK ("status" IN ('RUNNING','SUCCESS','FAILED'))
);

CREATE INDEX "finance_integration_sync_runs_integration_idx"
  ON "finance_integration_sync_runs"("integration_id", "started_at" DESC);

ALTER TABLE "finance_integration_sync_runs"
  ADD CONSTRAINT "finance_integration_sync_runs_integration_fkey"
  FOREIGN KEY ("integration_id") REFERENCES "finance_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
