BEGIN;

CREATE TABLE IF NOT EXISTS training_question_bank_questions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  category TEXT NOT NULL DEFAULT 'GENERAL',
  question_type TEXT NOT NULL,
  prompt TEXT NOT NULL,
  options JSONB,
  correct_answer JSONB NOT NULL,
  default_points NUMERIC(10,2) NOT NULL DEFAULT 1,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  published_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT training_question_bank_status_chk CHECK(status IN ('DRAFT','PUBLISHED','RETIRED')),
  CONSTRAINT training_question_bank_type_chk CHECK(question_type IN ('SINGLE_CHOICE','MULTIPLE_CHOICE','TRUE_FALSE')),
  CONSTRAINT training_question_bank_version_chk CHECK(version >= 1),
  CONSTRAINT training_question_bank_points_chk CHECK(default_points > 0),
  UNIQUE(tenant_id,company_id,code,version)
);

CREATE UNIQUE INDEX IF NOT EXISTS training_question_bank_one_published_uq
  ON training_question_bank_questions(tenant_id,company_id,code)
  WHERE status='PUBLISHED';

CREATE INDEX IF NOT EXISTS training_question_bank_scope_idx
  ON training_question_bank_questions(tenant_id,company_id,status,category,code,version DESC);

ALTER TABLE training_exam_questions
  ADD COLUMN IF NOT EXISTS question_bank_id TEXT REFERENCES training_question_bank_questions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS question_bank_version INTEGER;

CREATE INDEX IF NOT EXISTS training_exam_questions_bank_idx
  ON training_exam_questions(tenant_id,company_id,question_bank_id)
  WHERE question_bank_id IS NOT NULL;

COMMIT;
