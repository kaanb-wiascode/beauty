ALTER TABLE "operations_waitlist_entries"
  ADD COLUMN "time_zone" TEXT NOT NULL DEFAULT 'Europe/Istanbul';

ALTER TABLE "operations_waitlist_entries"
  ADD CONSTRAINT "operations_waitlist_entries_timezone_check"
  CHECK (length(trim("time_zone")) BETWEEN 1 AND 80);
