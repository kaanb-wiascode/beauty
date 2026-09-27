DO $$
DECLARE
  subject_expression TEXT;
BEGIN
  ALTER TABLE crm_events DROP CONSTRAINT IF EXISTS crm_events_subject_check;

  SELECT string_agg(format('%I IS NOT NULL', column_name), ' OR ' ORDER BY ordinal_position)
    INTO subject_expression
    FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'crm_events'
     AND column_name LIKE '%\_id' ESCAPE '\'
     AND column_name NOT IN (
       'id',
       'tenant_id',
       'company_id',
       'branch_id',
       'actor_user_id',
       'created_by_user_id',
       'updated_by_user_id'
     );

  IF subject_expression IS NULL THEN
    RAISE EXCEPTION 'crm_events subject columns could not be resolved';
  END IF;

  EXECUTE format(
    'ALTER TABLE crm_events ADD CONSTRAINT crm_events_subject_check CHECK (%s) NOT VALID',
    subject_expression
  );
END
$$;
