CREATE TABLE "platform_customer_accounts" (
    "tenant_id" TEXT NOT NULL,
    "legal_name" TEXT,
    "account_owner_user_id" TEXT,
    "customer_success_owner_user_id" TEXT,
    "go_live_at" TIMESTAMP(3),
    "renewal_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_customer_accounts_pkey" PRIMARY KEY ("tenant_id"),
    CONSTRAINT "platform_customer_accounts_tenant_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "platform_customer_accounts_account_owner_fkey"
      FOREIGN KEY ("account_owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "platform_customer_accounts_cs_owner_fkey"
      FOREIGN KEY ("customer_success_owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "platform_customer_notes" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "tenant_id" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_customer_notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "platform_customer_notes_body_check" CHECK (char_length(trim("body")) BETWEEN 1 AND 4000),
    CONSTRAINT "platform_customer_notes_tenant_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "platform_customer_notes_author_fkey"
      FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "platform_customer_notes_tenant_created_at_idx"
  ON "platform_customer_notes" ("tenant_id", "created_at" DESC);

INSERT INTO "platform_customer_accounts" ("tenant_id")
SELECT "id" FROM "tenants"
ON CONFLICT ("tenant_id") DO NOTHING;
