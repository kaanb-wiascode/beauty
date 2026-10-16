CREATE OR REPLACE FUNCTION enforce_visit_service_execution_completion()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."status" = 'SERVICE_COMPLETED'::"VisitStatus"
     AND OLD."status" IS DISTINCT FROM NEW."status" THEN
    IF NEW."source" = 'APPOINTMENT'::"VisitSource" THEN
      IF EXISTS (
        SELECT 1
        FROM "visit_appointments" va
        WHERE va."visitId" = NEW."id"
          AND NOT EXISTS (
            SELECT 1
            FROM "operations_service_executions" e
            WHERE e."visit_id" = NEW."id"
              AND e."appointment_id" = va."appointmentId"
              AND e."tenant_id" = NEW."tenantId"
              AND e."company_id" = NEW."companyId"
              AND e."branch_id" = NEW."branchId"
              AND e."status" = 'COMPLETED'::"ServiceExecutionStatus"
          )
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'Appointment-backed visit requires completed service executions before SERVICE_COMPLETED.';
      END IF;
    ELSIF NEW."source" = 'WALK_IN'::"VisitSource" THEN
      IF NOT EXISTS (
        SELECT 1
        FROM "operations_service_executions" e
        WHERE e."visit_id" = NEW."id"
          AND e."tenant_id" = NEW."tenantId"
          AND e."company_id" = NEW."companyId"
          AND e."branch_id" = NEW."branchId"
          AND e."appointment_id" IS NULL
          AND e."walk_in_commercial_context_id" IS NOT NULL
          AND e."sale_item_id" IS NOT NULL
          AND e."status" = 'COMPLETED'::"ServiceExecutionStatus"
      ) OR EXISTS (
        SELECT 1
        FROM "operations_service_executions" e
        WHERE e."visit_id" = NEW."id"
          AND e."tenant_id" = NEW."tenantId"
          AND e."company_id" = NEW."companyId"
          AND e."branch_id" = NEW."branchId"
          AND e."status" = 'IN_PROGRESS'::"ServiceExecutionStatus"
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'Walk-in visit requires at least one completed service execution and no in-progress execution before SERVICE_COMPLETED.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
