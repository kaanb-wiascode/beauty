-- Enforce HR certification requirements at the appointment persistence boundary.
-- This protects every appointment writer, not only the current API service.

CREATE OR REPLACE FUNCTION enforce_appointment_staff_certification_eligibility()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  missing_certification TEXT;
BEGIN
  -- Cancelled/no-show records no longer represent a service assignment and must remain editable.
  IF NEW."status" IN ('CANCELLED', 'NO_SHOW') THEN
    RETURN NEW;
  END IF;

  SELECT ct."name"
    INTO missing_certification
  FROM "hr_certification_service_eligibility" requirement
  JOIN "hr_certification_types" ct
    ON ct."id" = requirement."certification_type_id"
   AND ct."tenant_id" = requirement."tenant_id"
   AND ct."company_id" = requirement."company_id"
   AND ct."active" = TRUE
  JOIN "branches" branch
    ON branch."id" = NEW."branchId"
   AND branch."companyId" = requirement."company_id"
  WHERE requirement."tenant_id" = NEW."tenantId"
    AND requirement."service_id" = NEW."serviceId"
    AND requirement."required" = TRUE
    AND NOT EXISTS (
      SELECT 1
      FROM "hr_employee_certifications" certification
      WHERE certification."tenant_id" = NEW."tenantId"
        AND certification."company_id" = requirement."company_id"
        AND certification."branch_id" = NEW."branchId"
        AND certification."staff_id" = NEW."staffId"
        AND certification."certification_type_id" = requirement."certification_type_id"
        AND certification."status" = 'VERIFIED'
        AND (certification."issued_at" IS NULL OR certification."issued_at" <= NEW."startAt"::date)
        AND (certification."expires_at" IS NULL OR certification."expires_at" >= NEW."startAt"::date)
    )
  ORDER BY ct."name"
  LIMIT 1;

  IF missing_certification IS NOT NULL THEN
    RAISE EXCEPTION 'Staff is not certification-eligible for service at appointment date. Missing: %', missing_certification
      USING ERRCODE = '23514',
            HINT = 'Assign a staff member with a verified, in-scope and unexpired required certification.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_staff_certification_eligibility ON "appointments";
CREATE TRIGGER appointments_staff_certification_eligibility
BEFORE INSERT OR UPDATE OF "staffId", "serviceId", "branchId", "startAt", "status"
ON "appointments"
FOR EACH ROW
EXECUTE FUNCTION enforce_appointment_staff_certification_eligibility();
