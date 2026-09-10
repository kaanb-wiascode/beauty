CREATE TABLE "audit_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tenant_id" UUID,
  "company_id" UUID,
  "branch_id" UUID,
  "actor_user_id" UUID,
  "request_id" VARCHAR(128),
  "action" VARCHAR(120) NOT NULL,
  "resource" VARCHAR(500) NOT NULL,
  "result" VARCHAR(20) NOT NULL,
  "status_code" INTEGER,
  "metadata" JSONB,

  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_events_tenant_occurred_at_idx"
  ON "audit_events" ("tenant_id", "occurred_at");
CREATE INDEX "audit_events_actor_occurred_at_idx"
  ON "audit_events" ("actor_user_id", "occurred_at");
CREATE INDEX "audit_events_action_occurred_at_idx"
  ON "audit_events" ("action", "occurred_at");
CREATE INDEX "audit_events_request_id_idx"
  ON "audit_events" ("request_id");

ALTER TABLE "audit_events"
  ADD CONSTRAINT "audit_events_result_check"
  CHECK ("result" IN ('SUCCESS', 'FAILURE'));
