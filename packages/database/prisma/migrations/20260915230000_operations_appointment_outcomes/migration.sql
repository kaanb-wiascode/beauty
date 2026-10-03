CREATE TABLE "operations_cancellation_reasons" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "applies_to" TEXT NOT NULL DEFAULT 'BOTH',
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "sort_order" INTEGER NOT NULL DEFAULT 100,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operations_cancellation_reasons_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operations_cancellation_reasons_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "operations_cancellation_reasons_company_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT,
  CONSTRAINT "operations_cancellation_reasons_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE,
  CONSTRAINT "operations_cancellation_reasons_applies_check" CHECK ("applies_to" IN ('CANCELLED','NO_SHOW','BOTH')),
  UNIQUE ("tenant_id", "company_id", "branch_id", "code")
);

CREATE TABLE "operations_appointment_outcomes" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "appointment_id" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "reason_id" TEXT,
  "reason_code_snapshot" TEXT NOT NULL,
  "reason_label_snapshot" TEXT NOT NULL,
  "note" TEXT,
  "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actor_membership_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operations_appointment_outcomes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operations_appointment_outcomes_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "operations_appointment_outcomes_company_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT,
  CONSTRAINT "operations_appointment_outcomes_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "operations_appointment_outcomes_appointment_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT,
  CONSTRAINT "operations_appointment_outcomes_reason_fkey" FOREIGN KEY ("reason_id") REFERENCES "operations_cancellation_reasons"("id") ON DELETE SET NULL,
  CONSTRAINT "operations_appointment_outcomes_actor_fkey" FOREIGN KEY ("actor_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT,
  CONSTRAINT "operations_appointment_outcomes_type_check" CHECK ("outcome" IN ('CANCELLED','NO_SHOW')),
  UNIQUE ("appointment_id")
);

CREATE INDEX "operations_cancellation_reasons_scope_idx" ON "operations_cancellation_reasons"("tenant_id", "company_id", "branch_id", "active");
CREATE INDEX "operations_appointment_outcomes_scope_idx" ON "operations_appointment_outcomes"("tenant_id", "company_id", "branch_id", "outcome", "occurred_at");

INSERT INTO "operations_cancellation_reasons" ("tenant_id", "company_id", "branch_id", "code", "label", "applies_to", "sort_order")
SELECT c."tenantId", c.id, NULL, seed.code, seed.label, seed.applies_to, seed.sort_order
FROM companies c
CROSS JOIN (VALUES
  ('CUSTOMER_REQUEST','Müşteri talebi','CANCELLED',10),
  ('STAFF_UNAVAILABLE','Personel uygun değil','CANCELLED',20),
  ('DEVICE_FAILURE','Cihaz arızası','CANCELLED',30),
  ('BRANCH_ISSUE','Şube kaynaklı','CANCELLED',40),
  ('HEALTH_REASON','Sağlık nedeniyle','CANCELLED',50),
  ('PRICE','Fiyat nedeniyle','CANCELLED',60),
  ('NO_RESPONSE','Müşteriye ulaşılamadı','NO_SHOW',70),
  ('CUSTOMER_ABSENT','Müşteri gelmedi','NO_SHOW',80),
  ('OTHER','Diğer','BOTH',999)
) AS seed(code,label,applies_to,sort_order)
ON CONFLICT DO NOTHING;