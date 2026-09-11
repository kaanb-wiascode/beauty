CREATE TABLE "supplier_verification_cases" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "supplier_organization_id" TEXT NOT NULL REFERENCES "supplier_organizations"("id") ON DELETE RESTRICT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "opened_by_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "reviewed_by_user_id" TEXT REFERENCES "users"("id") ON DELETE RESTRICT,
  "submitted_at" TIMESTAMPTZ,
  "reviewed_at" TIMESTAMPTZ,
  "decision_reason" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "supplier_verification_cases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_verification_cases_status_check" CHECK (
    "status" IN ('DRAFT','SUBMITTED','IN_REVIEW','APPROVED','REJECTED','CANCELLED')
  )
);

CREATE UNIQUE INDEX "supplier_verification_one_open_case_key"
  ON "supplier_verification_cases"("supplier_organization_id")
  WHERE "status" IN ('DRAFT','SUBMITTED','IN_REVIEW');

CREATE INDEX "supplier_verification_cases_org_created_idx"
  ON "supplier_verification_cases"("supplier_organization_id", "created_at" DESC);

CREATE TABLE "supplier_verification_documents" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "verification_case_id" TEXT NOT NULL REFERENCES "supplier_verification_cases"("id") ON DELETE CASCADE,
  "document_type" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" BIGINT,
  "checksum_sha256" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "uploaded_by_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "supplier_verification_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_verification_documents_type_check" CHECK (
    "document_type" IN ('TAX_REGISTRATION','TRADE_REGISTRY','AUTHORIZATION','BANK_ACCOUNT_PROOF','CERTIFICATE','OTHER')
  ),
  CONSTRAINT "supplier_verification_documents_status_check" CHECK (
    "status" IN ('PENDING','ACCEPTED','REJECTED')
  )
);

CREATE UNIQUE INDEX "supplier_verification_documents_storage_key"
  ON "supplier_verification_documents"("storage_key");

CREATE INDEX "supplier_verification_documents_case_idx"
  ON "supplier_verification_documents"("verification_case_id", "created_at");

CREATE TABLE "supplier_verification_audit_logs" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "supplier_organization_id" TEXT NOT NULL REFERENCES "supplier_organizations"("id") ON DELETE RESTRICT,
  "verification_case_id" TEXT NOT NULL REFERENCES "supplier_verification_cases"("id") ON DELETE RESTRICT,
  "actor_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "action" TEXT NOT NULL,
  "from_status" TEXT,
  "to_status" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "supplier_verification_audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_verification_audit_action_check" CHECK (
    "action" IN ('CASE_OPENED','DOCUMENT_REGISTERED','CASE_SUBMITTED','REVIEW_STARTED','CASE_APPROVED','CASE_REJECTED','CASE_CANCELLED')
  )
);

CREATE INDEX "supplier_verification_audit_case_created_idx"
  ON "supplier_verification_audit_logs"("verification_case_id", "created_at");
