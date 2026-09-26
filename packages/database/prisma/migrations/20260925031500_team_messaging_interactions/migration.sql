CREATE TABLE "team_message_reactions" (
  "message_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "team_message_reactions_pkey" PRIMARY KEY ("message_id","user_id","emoji"),
  CONSTRAINT "team_message_reactions_message_fkey" FOREIGN KEY ("message_id") REFERENCES "team_messages"("id") ON DELETE CASCADE,
  CONSTRAINT "team_message_reactions_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "team_message_reactions_emoji_check" CHECK (char_length("emoji") BETWEEN 1 AND 16)
);

CREATE INDEX "team_message_reactions_message_idx"
  ON "team_message_reactions"("message_id");
