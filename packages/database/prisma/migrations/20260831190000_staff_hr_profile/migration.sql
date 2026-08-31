-- Add flexible personnel HR/employee-file profile storage
ALTER TABLE "staff"
ADD COLUMN "profile" JSONB;
