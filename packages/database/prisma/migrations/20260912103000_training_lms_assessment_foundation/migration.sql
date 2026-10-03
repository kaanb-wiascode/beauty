BEGIN;

CREATE TABLE IF NOT EXISTS training_course_versions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  title TEXT NOT NULL,
  description TEXT,
  delivery_type TEXT NOT NULL,
  theory_pass_score NUMERIC(5,2),
  practical_pass_score NUMERIC(5,2),
  requires_theory BOOLEAN NOT NULL DEFAULT false,
  requires_practical BOOLEAN NOT NULL DEFAULT false,
  effective_from DATE,
  effective_to DATE,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  published_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT training_course_versions_status_chk CHECK(status IN ('DRAFT','PUBLISHED','RETIRED')),
  CONSTRAINT training_course_versions_delivery_chk CHECK(delivery_type IN ('THEORY','PRACTICAL','BLENDED')),
  CONSTRAINT training_course_versions_theory_score_chk CHECK(theory_pass_score IS NULL OR theory_pass_score BETWEEN 0 AND 100),
  CONSTRAINT training_course_versions_practical_score_chk CHECK(practical_pass_score IS NULL OR practical_pass_score BETWEEN 0 AND 100),
  CONSTRAINT training_course_versions_effective_chk CHECK(effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from),
  UNIQUE(tenant_id,company_id,course_id,version)
);

CREATE UNIQUE INDEX IF NOT EXISTS training_course_versions_one_published_uq
  ON training_course_versions(tenant_id,company_id,course_id)
  WHERE status='PUBLISHED';
CREATE INDEX IF NOT EXISTS training_course_versions_scope_idx
  ON training_course_versions(tenant_id,company_id,course_id,status,version DESC);

CREATE TABLE IF NOT EXISTS training_lessons (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  course_version_id TEXT NOT NULL REFERENCES training_course_versions(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  title TEXT NOT NULL,
  content_type TEXT NOT NULL,
  content_text TEXT,
  content_ref TEXT,
  duration_minutes INTEGER,
  is_required BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT training_lessons_type_chk CHECK(content_type IN ('TEXT','VIDEO','LINK','DOCUMENT')),
  CONSTRAINT training_lessons_sequence_chk CHECK(sequence >= 1),
  CONSTRAINT training_lessons_duration_chk CHECK(duration_minutes IS NULL OR duration_minutes >= 0),
  UNIQUE(course_version_id,sequence)
);
CREATE INDEX IF NOT EXISTS training_lessons_version_idx ON training_lessons(course_version_id,sequence);

CREATE TABLE IF NOT EXISTS training_exams (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  course_version_id TEXT NOT NULL REFERENCES training_course_versions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  pass_score NUMERIC(5,2) NOT NULL,
  max_attempts INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT training_exams_score_chk CHECK(pass_score BETWEEN 0 AND 100),
  CONSTRAINT training_exams_attempts_chk CHECK(max_attempts IS NULL OR max_attempts >= 1)
);
CREATE INDEX IF NOT EXISTS training_exams_version_idx ON training_exams(course_version_id,is_active);

CREATE TABLE IF NOT EXISTS training_exam_questions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  exam_id TEXT NOT NULL REFERENCES training_exams(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  question_type TEXT NOT NULL,
  prompt TEXT NOT NULL,
  options JSONB,
  correct_answer JSONB NOT NULL,
  points NUMERIC(10,2) NOT NULL DEFAULT 1,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT training_exam_questions_type_chk CHECK(question_type IN ('SINGLE_CHOICE','MULTIPLE_CHOICE','TRUE_FALSE')),
  CONSTRAINT training_exam_questions_sequence_chk CHECK(sequence >= 1),
  CONSTRAINT training_exam_questions_points_chk CHECK(points > 0),
  UNIQUE(exam_id,sequence)
);
CREATE INDEX IF NOT EXISTS training_exam_questions_exam_idx ON training_exam_questions(exam_id,sequence);

ALTER TABLE training_assignments
  ADD COLUMN IF NOT EXISTS course_version_id TEXT REFERENCES training_course_versions(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS training_assignments_version_idx
  ON training_assignments(tenant_id,company_id,course_version_id)
  WHERE course_version_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS training_exam_attempts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  assignment_id TEXT NOT NULL REFERENCES training_assignments(id) ON DELETE CASCADE,
  exam_id TEXT NOT NULL REFERENCES training_exams(id) ON DELETE RESTRICT,
  staff_id TEXT REFERENCES staff(id) ON DELETE SET NULL,
  attempt_no INTEGER NOT NULL,
  answers JSONB NOT NULL,
  score NUMERIC(5,2) NOT NULL,
  passed BOOLEAN NOT NULL,
  grading_detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT training_exam_attempts_no_chk CHECK(attempt_no >= 1),
  CONSTRAINT training_exam_attempts_score_chk CHECK(score BETWEEN 0 AND 100),
  UNIQUE(assignment_id,exam_id,attempt_no)
);
CREATE INDEX IF NOT EXISTS training_exam_attempts_assignment_idx ON training_exam_attempts(assignment_id,exam_id,attempt_no DESC);

CREATE TABLE IF NOT EXISTS training_practical_assessments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  assignment_id TEXT NOT NULL REFERENCES training_assignments(id) ON DELETE CASCADE,
  staff_id TEXT REFERENCES staff(id) ON DELETE SET NULL,
  score NUMERIC(5,2) NOT NULL,
  passed BOOLEAN NOT NULL,
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence JSONB,
  note TEXT,
  assessor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assessed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT training_practical_assessments_score_chk CHECK(score BETWEEN 0 AND 100)
);
CREATE INDEX IF NOT EXISTS training_practical_assignment_idx ON training_practical_assessments(assignment_id,assessed_at DESC);

CREATE TABLE IF NOT EXISTS training_assignment_results (
  assignment_id TEXT PRIMARY KEY REFERENCES training_assignments(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  course_version_id TEXT NOT NULL REFERENCES training_course_versions(id) ON DELETE RESTRICT,
  theory_score NUMERIC(5,2),
  theory_passed BOOLEAN,
  practical_score NUMERIC(5,2),
  practical_passed BOOLEAN,
  final_passed BOOLEAN NOT NULL,
  explanation JSONB NOT NULL DEFAULT '{}'::jsonb,
  finalized_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  finalized_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS training_assignment_results_scope_idx ON training_assignment_results(tenant_id,company_id,branch_id,finalized_at DESC);

CREATE TABLE IF NOT EXISTS training_certificates (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  assignment_id TEXT NOT NULL REFERENCES training_assignments(id) ON DELETE RESTRICT,
  course_version_id TEXT NOT NULL REFERENCES training_course_versions(id) ON DELETE RESTRICT,
  certificate_no TEXT NOT NULL,
  issued_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  issued_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP(3),
  revoked_at TIMESTAMP(3),
  revoked_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  revoke_reason TEXT,
  CONSTRAINT training_certificates_expiry_chk CHECK(expires_at IS NULL OR expires_at > issued_at),
  UNIQUE(tenant_id,company_id,certificate_no),
  UNIQUE(assignment_id)
);
CREATE INDEX IF NOT EXISTS training_certificates_staff_idx ON training_certificates(tenant_id,company_id,staff_id,issued_at DESC);

ALTER TABLE training_assignment_events DROP CONSTRAINT IF EXISTS training_assignment_events_type_chk;
ALTER TABLE training_assignment_events ADD CONSTRAINT training_assignment_events_type_chk
  CHECK(event_type IN ('CREATED','STARTED','COMPLETED','CANCELLED','EXPIRED','DUE_CHANGED','COURSE_VERSION_PINNED','EXAM_SUBMITTED','PRACTICAL_ASSESSED','RESULT_FINALIZED','CERTIFICATE_ISSUED'));

COMMIT;
