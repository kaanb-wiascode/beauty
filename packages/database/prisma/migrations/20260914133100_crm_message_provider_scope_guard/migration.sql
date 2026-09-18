CREATE OR REPLACE FUNCTION validate_crm_message_provider_connection_scope() RETURNS TRIGGER AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM companies c JOIN branches b ON b."companyId"=c.id WHERE c.id=NEW.company_id AND c."tenantId"=NEW.tenant_id AND b.id=NEW.branch_id) THEN RAISE EXCEPTION 'crm message provider connection scope mismatch'; END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER crm_message_provider_connections_scope_guard BEFORE INSERT OR UPDATE ON crm_message_provider_connections FOR EACH ROW EXECUTE FUNCTION validate_crm_message_provider_connection_scope();
