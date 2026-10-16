CREATE TABLE "team_announcement_acknowledgements" (
  "message_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "acknowledged_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "team_announcement_acknowledgements_pkey" PRIMARY KEY ("message_id","user_id"),
  CONSTRAINT "team_announcement_acknowledgements_message_fkey" FOREIGN KEY ("message_id") REFERENCES "team_messages"("id") ON DELETE CASCADE,
  CONSTRAINT "team_announcement_acknowledgements_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX "team_announcement_acknowledgements_message_idx"
  ON "team_announcement_acknowledgements"("message_id","acknowledged_at");
