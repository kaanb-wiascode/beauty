CREATE TABLE "team_user_presence" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "status_text" TEXT,
  "status_until" TIMESTAMPTZ,
  "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "team_user_presence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "team_user_presence_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "team_user_presence_company_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "team_user_presence_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "team_user_presence_status_check" CHECK ("status" IN ('AVAILABLE','BUSY','IN_SESSION','ON_BREAK','IN_MEETING','DO_NOT_DISTURB','OFFLINE'))
);

CREATE UNIQUE INDEX "team_user_presence_tenant_company_user_key"
  ON "team_user_presence"("tenant_id","company_id","user_id");
CREATE INDEX "team_user_presence_company_status_idx"
  ON "team_user_presence"("company_id","status");

CREATE TABLE "team_conversations" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "name" TEXT,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "team_conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "team_conversations_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "team_conversations_company_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "team_conversations_created_by_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "team_conversations_type_check" CHECK ("type" IN ('DIRECT','GROUP','CHANNEL'))
);

CREATE INDEX "team_conversations_company_updated_idx"
  ON "team_conversations"("company_id","updated_at" DESC);

CREATE TABLE "team_conversation_members" (
  "conversation_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "is_admin" BOOLEAN NOT NULL DEFAULT FALSE,
  "joined_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "last_read_at" TIMESTAMPTZ,
  CONSTRAINT "team_conversation_members_pkey" PRIMARY KEY ("conversation_id","user_id"),
  CONSTRAINT "team_conversation_members_conversation_fkey" FOREIGN KEY ("conversation_id") REFERENCES "team_conversations"("id") ON DELETE CASCADE,
  CONSTRAINT "team_conversation_members_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX "team_conversation_members_user_idx"
  ON "team_conversation_members"("user_id");

CREATE TABLE "team_messages" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "sender_user_id" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "reply_to_message_id" TEXT,
  "edited_at" TIMESTAMPTZ,
  "deleted_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "team_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "team_messages_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "team_messages_company_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "team_messages_conversation_fkey" FOREIGN KEY ("conversation_id") REFERENCES "team_conversations"("id") ON DELETE CASCADE,
  CONSTRAINT "team_messages_sender_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "team_messages_reply_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "team_messages"("id") ON DELETE SET NULL,
  CONSTRAINT "team_messages_body_check" CHECK (char_length(btrim("body")) BETWEEN 1 AND 10000)
);

CREATE INDEX "team_messages_conversation_created_idx"
  ON "team_messages"("conversation_id","created_at" DESC);
CREATE INDEX "team_messages_company_created_idx"
  ON "team_messages"("company_id","created_at" DESC);
