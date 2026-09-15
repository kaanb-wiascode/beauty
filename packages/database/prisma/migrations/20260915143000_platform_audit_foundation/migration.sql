CREATE TABLE "platform_audit_events" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "actor_user_id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_tenant_id" TEXT,
    "target_entity_type" TEXT,
    "target_entity_id" TEXT,
    "reason" TEXT,
    "before_state" JSONB,
    "after_state" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_audit_events_created_at_idx"
    ON "platform_audit_events"("created_at" DESC);

CREATE INDEX "platform_audit_events_actor_created_at_idx"
    ON "platform_audit_events"("actor_user_id", "created_at" DESC);

CREATE INDEX "platform_audit_events_tenant_created_at_idx"
    ON "platform_audit_events"("target_tenant_id", "created_at" DESC)
    WHERE "target_tenant_id" IS NOT NULL;

CREATE INDEX "platform_audit_events_resource_action_created_at_idx"
    ON "platform_audit_events"("resource", "action", "created_at" DESC);

CREATE INDEX "platform_audit_events_correlation_id_idx"
    ON "platform_audit_events"("correlation_id")
    WHERE "correlation_id" IS NOT NULL;

-- Platform audit is append-only. Historical accountability must survive ordinary
-- application mistakes and must not depend on mutable tenant or platform records.
CREATE OR REPLACE FUNCTION prevent_platform_audit_mutation()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'platform_audit_events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER platform_audit_events_no_update
BEFORE UPDATE ON "platform_audit_events"
FOR EACH ROW EXECUTE FUNCTION prevent_platform_audit_mutation();

CREATE TRIGGER platform_audit_events_no_delete
BEFORE DELETE ON "platform_audit_events"
FOR EACH ROW EXECUTE FUNCTION prevent_platform_audit_mutation();
