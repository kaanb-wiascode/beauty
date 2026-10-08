BEGIN;

ALTER TABLE training_certificates
  ADD COLUMN IF NOT EXISTS renewed_from_certificate_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS replacement_certificate_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS renewal_completed_at TIMESTAMP(3) NULL,
  ADD COLUMN IF NOT EXISTS renewal_completed_by_user_id TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'training_certificates_renewed_from_fk'
  ) THEN
    ALTER TABLE training_certificates
      ADD CONSTRAINT training_certificates_renewed_from_fk
      FOREIGN KEY (renewed_from_certificate_id) REFERENCES training_certificates(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'training_certificates_replacement_fk'
  ) THEN
    ALTER TABLE training_certificates
      ADD CONSTRAINT training_certificates_replacement_fk
      FOREIGN KEY (replacement_certificate_id) REFERENCES training_certificates(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS training_certificates_renewed_from_idx
  ON training_certificates(tenant_id, company_id, renewed_from_certificate_id)
  WHERE renewed_from_certificate_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS training_certificates_replacement_unique
  ON training_certificates(replacement_certificate_id)
  WHERE replacement_certificate_id IS NOT NULL;

CREATE OR REPLACE FUNCTION training_certificate_set_renewal_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_certificate_id TEXT;
BEGIN
  IF NEW.assignment_id IS NULL OR NEW.renewed_from_certificate_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT cert.id
    INTO source_certificate_id
    FROM training_certificates cert
   WHERE cert.tenant_id = NEW.tenant_id
     AND cert.company_id = NEW.company_id
     AND cert.renewal_assignment_id = NEW.assignment_id
     AND cert.id <> NEW.id
   ORDER BY cert.issued_at DESC, cert.id
   LIMIT 1;

  IF source_certificate_id IS NOT NULL THEN
    NEW.renewed_from_certificate_id := source_certificate_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_training_certificate_set_renewal_source ON training_certificates;
CREATE TRIGGER trg_training_certificate_set_renewal_source
BEFORE INSERT OR UPDATE OF assignment_id
ON training_certificates
FOR EACH ROW
EXECUTE FUNCTION training_certificate_set_renewal_source();

CREATE OR REPLACE FUNCTION training_certificate_complete_renewal_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.renewed_from_certificate_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE training_certificates source
     SET replacement_certificate_id = COALESCE(source.replacement_certificate_id, NEW.id),
         renewal_completed_at = COALESCE(source.renewal_completed_at, NEW.issued_at, now()),
         renewal_completed_by_user_id = COALESCE(source.renewal_completed_by_user_id, NEW.issued_by_user_id)
   WHERE source.id = NEW.renewed_from_certificate_id
     AND source.tenant_id = NEW.tenant_id
     AND source.company_id = NEW.company_id
     AND (source.replacement_certificate_id IS NULL OR source.replacement_certificate_id = NEW.id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_training_certificate_complete_renewal_lineage ON training_certificates;
CREATE TRIGGER trg_training_certificate_complete_renewal_lineage
AFTER INSERT OR UPDATE OF renewed_from_certificate_id
ON training_certificates
FOR EACH ROW
EXECUTE FUNCTION training_certificate_complete_renewal_lineage();

COMMIT;
