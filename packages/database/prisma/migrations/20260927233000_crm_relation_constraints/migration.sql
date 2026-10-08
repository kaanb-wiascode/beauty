DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='crm_interactions_lead_fk'
  ) THEN
    ALTER TABLE crm_interactions
      ADD CONSTRAINT crm_interactions_lead_fk
      FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='crm_interactions_opportunity_fk'
  ) THEN
    ALTER TABLE crm_interactions
      ADD CONSTRAINT crm_interactions_opportunity_fk
      FOREIGN KEY (opportunity_id) REFERENCES crm_opportunities(id) ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='crm_quotes_opportunity_fk'
  ) THEN
    ALTER TABLE crm_quotes
      ADD CONSTRAINT crm_quotes_opportunity_fk
      FOREIGN KEY (opportunity_id) REFERENCES crm_opportunities(id) ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='crm_teams_branch_fk'
  ) THEN
    ALTER TABLE crm_teams
      ADD CONSTRAINT crm_teams_branch_fk
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE NOT VALID;
  END IF;
END
$$;
