DO $$
BEGIN
  IF to_regclass('public.operations_waitlist_entries') IS NOT NULL THEN
    ALTER TABLE "operations_waitlist_entries"
      ADD COLUMN IF NOT EXISTS "time_zone" TEXT NOT NULL DEFAULT 'Europe/Istanbul';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'operations_waitlist_entries_timezone_check'
    ) THEN
      ALTER TABLE "operations_waitlist_entries"
        ADD CONSTRAINT "operations_waitlist_entries_timezone_check"
        CHECK (length(trim("time_zone")) BETWEEN 1 AND 80);
    END IF;
  END IF;
END $$;
