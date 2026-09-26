CREATE TABLE "training_practical_rubrics" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "course_version_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "instructions" TEXT,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "training_practical_rubrics_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "training_practical_rubrics_version_fkey" FOREIGN KEY ("course_version_id") REFERENCES "training_course_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "training_practical_rubrics_created_by_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "training_practical_rubrics_version_key" ON "training_practical_rubrics"("tenant_id","company_id","course_version_id");

CREATE TABLE "training_practical_rubric_criteria" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "rubric_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "weight_percent" DECIMAL(6,3) NOT NULL,
  "minimum_score" DECIMAL(5,2),
  "is_required" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "training_practical_rubric_criteria_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "training_practical_rubric_criteria_rubric_fkey" FOREIGN KEY ("rubric_id") REFERENCES "training_practical_rubrics"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "training_practical_rubric_sequence_check" CHECK ("sequence" >= 1),
  CONSTRAINT "training_practical_rubric_weight_check" CHECK ("weight_percent" > 0 AND "weight_percent" <= 100),
  CONSTRAINT "training_practical_rubric_minimum_check" CHECK ("minimum_score" IS NULL OR ("minimum_score" >= 0 AND "minimum_score" <= 100))
);
CREATE UNIQUE INDEX "training_practical_rubric_criteria_sequence_key" ON "training_practical_rubric_criteria"("rubric_id","sequence");
CREATE UNIQUE INDEX "training_practical_rubric_criteria_code_key" ON "training_practical_rubric_criteria"("rubric_id","code");
CREATE INDEX "training_practical_rubric_criteria_scope_idx" ON "training_practical_rubric_criteria"("tenant_id","company_id","rubric_id");

CREATE OR REPLACE FUNCTION training_validate_practical_rubric_scope() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM training_course_versions v
    WHERE v.id=NEW.course_version_id AND v.tenant_id=NEW.tenant_id AND v.company_id=NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Practical rubric course version scope mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER training_practical_rubric_scope_guard
BEFORE INSERT OR UPDATE ON training_practical_rubrics
FOR EACH ROW EXECUTE FUNCTION training_validate_practical_rubric_scope();

CREATE OR REPLACE FUNCTION training_validate_practical_criterion_scope() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM training_practical_rubrics r
    WHERE r.id=NEW.rubric_id AND r.tenant_id=NEW.tenant_id AND r.company_id=NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Practical rubric criterion scope mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER training_practical_criterion_scope_guard
BEFORE INSERT OR UPDATE ON training_practical_rubric_criteria
FOR EACH ROW EXECUTE FUNCTION training_validate_practical_criterion_scope();
