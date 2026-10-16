CREATE TABLE "training_assignment_reminders" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "assignment_id" TEXT NOT NULL,
  "staff_id" TEXT,
  "reminder_type" TEXT NOT NULL,
  "reminder_date" DATE NOT NULL DEFAULT CURRENT_DATE,
  "due_at" TIMESTAMP(3),
  "acknowledged_at" TIMESTAMP(3),
  "acknowledged_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "training_assignment_reminders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "training_assignment_reminders_type_check" CHECK ("reminder_type" IN ('UPCOMING','DUE_TODAY','OVERDUE')),
  CONSTRAINT "training_assignment_reminders_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "training_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "training_assignment_reminders_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "training_assignment_reminders_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "training_assignment_reminders_ack_user_fkey" FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "training_assignment_reminders_dedupe_key"
  ON "training_assignment_reminders"("tenant_id","company_id","assignment_id","reminder_type","reminder_date");
CREATE INDEX "training_assignment_reminders_staff_open_idx"
  ON "training_assignment_reminders"("tenant_id","company_id","staff_id","acknowledged_at","created_at");
CREATE INDEX "training_assignment_reminders_branch_idx"
  ON "training_assignment_reminders"("tenant_id","company_id","branch_id","created_at");
