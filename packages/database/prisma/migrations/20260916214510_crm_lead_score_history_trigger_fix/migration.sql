BEGIN;

DROP TRIGGER IF EXISTS crm_leads_score_history_after_write ON crm_leads;
CREATE TRIGGER crm_leads_score_history_after_write
AFTER INSERT OR UPDATE ON crm_leads
FOR EACH ROW EXECUTE FUNCTION crm_record_lead_score_history();

COMMIT;
