ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS surveyor_first_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS surveyor_last_name_snapshot TEXT;

UPDATE crm_leads l
   SET surveyor_first_name_snapshot = COALESCE(l.surveyor_first_name_snapshot, s."firstName"),
       surveyor_last_name_snapshot = COALESCE(l.surveyor_last_name_snapshot, s."lastName")
  FROM staff s
 WHERE l.surveyor_staff_id=s.id
   AND (l.surveyor_first_name_snapshot IS NULL OR l.surveyor_last_name_snapshot IS NULL);
