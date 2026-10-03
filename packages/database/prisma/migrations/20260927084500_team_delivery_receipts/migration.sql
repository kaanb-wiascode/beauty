ALTER TABLE "team_conversation_members"
ADD COLUMN IF NOT EXISTS "last_delivered_at" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "team_conversation_members_delivery_idx"
ON "team_conversation_members"("conversation_id","last_delivered_at");
