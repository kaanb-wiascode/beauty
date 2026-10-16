ALTER TABLE "team_message_attachments"
ADD COLUMN IF NOT EXISTS "transcription_status" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN IF NOT EXISTS "transcription_text" TEXT,
ADD COLUMN IF NOT EXISTS "transcription_error" TEXT,
ADD COLUMN IF NOT EXISTS "transcribed_at" TIMESTAMPTZ;

ALTER TABLE "team_message_attachments"
DROP CONSTRAINT IF EXISTS "team_message_attachments_transcription_status_check";

ALTER TABLE "team_message_attachments"
ADD CONSTRAINT "team_message_attachments_transcription_status_check"
CHECK ("transcription_status" IN ('NONE','PROCESSING','COMPLETED','FAILED'));
