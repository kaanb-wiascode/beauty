ALTER TABLE "crm_follow_ups"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "cancelled_at" TIMESTAMPTZ,
  ADD COLUMN "cancellation_reason" TEXT;

UPDATE "crm_follow_ups"
SET "cancelled_at" = "updated_at",
    "cancellation_reason" = 'Legacy cancellation'
WHERE "status" = 'CANCELLED';

ALTER TABLE "crm_follow_ups"
  ADD CONSTRAINT "crm_follow_ups_version_check" CHECK ("version" >= 1),
  ADD CONSTRAINT "crm_follow_ups_cancellation_check" CHECK (
    ("status" = 'CANCELLED') = (
      "cancelled_at" IS NOT NULL AND "cancellation_reason" IS NOT NULL
    )
  );
