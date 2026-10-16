ALTER TABLE "services"
  ADD COLUMN "category" TEXT,
  ADD COLUMN "preparationMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cleanupMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cost" DECIMAL(10,2),
  ADD COLUMN "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 20,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'TRY',
  ADD COLUMN "requiresConsultation" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "services"
  ADD CONSTRAINT "services_preparation_minutes_nonnegative"
  CHECK ("preparationMinutes" >= 0),
  ADD CONSTRAINT "services_cleanup_minutes_nonnegative"
  CHECK ("cleanupMinutes" >= 0),
  ADD CONSTRAINT "services_tax_rate_range"
  CHECK ("taxRate" >= 0 AND "taxRate" <= 100),
  ADD CONSTRAINT "services_cost_nonnegative"
  CHECK ("cost" IS NULL OR "cost" >= 0);
