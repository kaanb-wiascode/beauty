CREATE TABLE "staff_commission_rates" (
  "staff_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "staff_commission_rates_pkey" PRIMARY KEY ("staff_id"),
  CONSTRAINT "staff_commission_rates_rate_check" CHECK ("rate" >= 0 AND "rate" <= 100)
);

CREATE TABLE "sale_item_attributions" (
  "sale_item_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "appointment_id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "commission_rate_snapshot" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "sale_item_attributions_pkey" PRIMARY KEY ("sale_item_id"),
  CONSTRAINT "sale_item_attributions_commission_check" CHECK ("commission_rate_snapshot" >= 0 AND "commission_rate_snapshot" <= 100),
  CONSTRAINT "sale_item_attributions_appointment_key" UNIQUE ("appointment_id")
);

CREATE INDEX "staff_commission_rates_tenant_branch_idx"
  ON "staff_commission_rates"("tenant_id", "branch_id");
CREATE INDEX "sale_item_attributions_tenant_branch_staff_idx"
  ON "sale_item_attributions"("tenant_id", "branch_id", "staff_id");

ALTER TABLE "staff_commission_rates" ADD CONSTRAINT "staff_commission_rates_staff_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_commission_rates" ADD CONSTRAINT "staff_commission_rates_tenant_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_commission_rates" ADD CONSTRAINT "staff_commission_rates_branch_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sale_item_attributions" ADD CONSTRAINT "sale_item_attributions_sale_item_fkey"
  FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_item_attributions" ADD CONSTRAINT "sale_item_attributions_tenant_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_item_attributions" ADD CONSTRAINT "sale_item_attributions_branch_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_item_attributions" ADD CONSTRAINT "sale_item_attributions_appointment_fkey"
  FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_item_attributions" ADD CONSTRAINT "sale_item_attributions_staff_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
