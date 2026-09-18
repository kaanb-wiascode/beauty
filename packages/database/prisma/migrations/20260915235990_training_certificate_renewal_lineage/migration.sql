ALTER TABLE training_certificates
  ADD COLUMN IF NOT EXISTS renewed_from_certificate_id TEXT NULL REFERENCES training_certificates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS replacement_certificate_id TEXT NULL REFERENCES training_certificates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS renewal_completed_at TIMESTAMPTZ NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_training_certificates_replacement_certificate
  ON training_certificates(replacement_certificate_id)
  WHERE replacement_certificate_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_training_certificates_renewed_from
  ON training_certificates(tenant_id, company_id, renewed_from_certificate_id)
  WHERE renewed_from_certificate_id IS NOT NULL;

CREATE OR REPLACE FUNCTION link_training_certificate_renewal_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  previous_certificate training_certificates%ROWTYPE;
BEGIN
  -- A normal course-completion certificate has no predecessor. A renewal
  -- certificate is identified by an older certificate whose renewal assignment
  -- is the assignment that produced NEW.
  SELECT cert.*
    INTO previous_certificate
    FROM training_certificates cert
   WHERE cert.tenant_id = NEW.tenant_id
     AND cert.company_id = NEW.company_id
     AND cert.branch_id = NEW.branch_id
     AND cert.staff_id = NEW.staff_id
     AND cert.renewal_assignment_id = NEW.assignment_id
     AND cert.id <> NEW.id
   ORDER BY cert.issued_at DESC, cert.id DESC
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- The renewal must stay inside the same logical course even when a newer
  -- published course version was assigned for recertification.
  IF NOT EXISTS (
    SELECT 1
      FROM training_course_versions old_v
      JOIN training_course_versions new_v ON new_v.id = NEW.course_version_id
     WHERE old_v.id = previous_certificate.course_version_id
       AND old_v.tenant_id = NEW.tenant_id
       AND old_v.company_id = NEW.company_id
       AND new_v.tenant_id = NEW.tenant_id
       AND new_v.company_id = NEW.company_id
       AND old_v.course_id = new_v.course_id
  ) THEN
    RAISE EXCEPTION 'Renewal certificate course does not match predecessor course';
  END IF;

  IF NEW.renewed_from_certificate_id IS NULL THEN
    NEW.renewed_from_certificate_id := previous_certificate.id;
  ELSIF NEW.renewed_from_certificate_id <> previous_certificate.id THEN
    RAISE EXCEPTION 'Renewal certificate predecessor mismatch';
  END IF;

  IF previous_certificate.replacement_certificate_id IS NOT NULL
     AND previous_certificate.replacement_certificate_id <> NEW.id THEN
    RAISE EXCEPTION 'Certificate already has a different renewal replacement';
  END IF;

  UPDATE training_certificates
     SET replacement_certificate_id = COALESCE(replacement_certificate_id, NEW.id),
         renewal_completed_at = COALESCE(renewal_completed_at, now())
   WHERE id = previous_certificate.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_training_certificate_renewal_lineage ON training_certificates;
CREATE TRIGGER trg_training_certificate_renewal_lineage
BEFORE INSERT OR UPDATE OF assignment_id, course_version_id, staff_id
ON training_certificates
FOR EACH ROW
EXECUTE FUNCTION link_training_certificate_renewal_lineage();
