ALTER TABLE "team_conversations"
  ADD COLUMN "announcement_only" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE "team_message_attachments" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "message_id" TEXT NOT NULL,
  "uploaded_by_user_id" TEXT NOT NULL,
  "original_name" TEXT NOT NULL,
  "storage_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "team_message_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "team_message_attachments_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "team_message_attachments_company_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "team_message_attachments_message_fkey" FOREIGN KEY ("message_id") REFERENCES "team_messages"("id") ON DELETE CASCADE,
  CONSTRAINT "team_message_attachments_user_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "team_message_attachments_size_check" CHECK ("size_bytes" > 0 AND "size_bytes" <= 15728640)
);

CREATE UNIQUE INDEX "team_message_attachments_storage_key"
  ON "team_message_attachments"("storage_name");
CREATE INDEX "team_message_attachments_message_idx"
  ON "team_message_attachments"("message_id");

CREATE TABLE "team_message_pins" (
  "conversation_id" TEXT NOT NULL,
  "message_id" TEXT NOT NULL,
  "pinned_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "team_message_pins_pkey" PRIMARY KEY ("conversation_id","message_id"),
  CONSTRAINT "team_message_pins_conversation_fkey" FOREIGN KEY ("conversation_id") REFERENCES "team_conversations"("id") ON DELETE CASCADE,
  CONSTRAINT "team_message_pins_message_fkey" FOREIGN KEY ("message_id") REFERENCES "team_messages"("id") ON DELETE CASCADE,
  CONSTRAINT "team_message_pins_user_fkey" FOREIGN KEY ("pinned_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE INDEX "team_message_pins_conversation_created_idx"
  ON "team_message_pins"("conversation_id","created_at" DESC);
