ALTER TABLE hr_personnel_documents
  ADD COLUMN IF NOT EXISTS file_data BYTEA;
