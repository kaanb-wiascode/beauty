BEGIN;

CREATE OR REPLACE FUNCTION audit_training_certificate_issue()
RETURNS trigger AS $$
BEGIN
  INSERT INTO training_certificate_events(
    tenant_id,company_id,branch_id,certificate_id,event_type,from_status,to_status,actor_user_id,metadata
  )
  VALUES(
    NEW.tenant_id,NEW.company_id,NEW.branch_id,NEW.id,'ISSUED',NULL,NEW.status,NEW.issued_by_user_id,
    jsonb_build_object('certificateNo',NEW.certificate_no,'assignmentId',NEW.assignment_id,'courseVersionId',NEW.course_version_id)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS training_certificate_issue_audit_trg ON training_certificates;
CREATE TRIGGER training_certificate_issue_audit_trg
AFTER INSERT ON training_certificates
FOR EACH ROW EXECUTE FUNCTION audit_training_certificate_issue();

-- Normalize any pre-existing lifecycle state before consumers rely on status.
UPDATE training_certificates
SET status='REVOKED'
WHERE revoked_at IS NOT NULL AND status<>'REVOKED';

UPDATE training_certificates
SET status='EXPIRED'
WHERE revoked_at IS NULL AND expires_at IS NOT NULL AND expires_at<=now() AND status='ACTIVE';

COMMIT;
