-- CreateEnum
CREATE TYPE "CustomerSource" AS ENUM ('INSTAGRAM', 'GOOGLE', 'REFERRAL', 'WALK_IN', 'OTHER');

-- CreateEnum
CREATE TYPE "CustomerDocumentType" AS ENUM ('KVKK_NOTICE', 'EXPLICIT_CONSENT', 'MEMBERSHIP_AGREEMENT', 'HEALTH_FORM', 'HEALTH_DATA_CONSENT');

-- CreateEnum
CREATE TYPE "CustomerConsentType" AS ENUM ('KVKK_ACKNOWLEDGEMENT', 'EXPLICIT_CONSENT', 'MEMBERSHIP_AGREEMENT', 'HEALTH_FORM_COMPLETION', 'HEALTH_DATA_CONSENT', 'MARKETING_SMS', 'MARKETING_EMAIL', 'MARKETING_PHONE');

-- CreateEnum
CREATE TYPE "CustomerConsentStatus" AS ENUM ('ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "ConsentSource" AS ENUM ('WEB', 'STAFF', 'KIOSK', 'DIGITAL_SIGNATURE');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "customerSource" "CustomerSource";

-- CreateTable
CREATE TABLE "customer_health_profiles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "formVersion" TEXT,
    "allergies" TEXT,
    "sensitivities" TEXT,
    "medications" TEXT,
    "conditions" TEXT,
    "notes" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_health_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_documents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT,
    "type" "CustomerDocumentType" NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "fileUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_consents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "documentId" TEXT,
    "type" "CustomerConsentType" NOT NULL,
    "status" "CustomerConsentStatus" NOT NULL,
    "documentVersion" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "source" "ConsentSource" NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "signedAt" TIMESTAMP(3),
    "signedDocumentUrl" TEXT,
    "documentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_health_profiles_customerId_key" ON "customer_health_profiles"("customerId");

-- CreateIndex
CREATE INDEX "customer_health_profiles_tenantId_idx" ON "customer_health_profiles"("tenantId");

-- CreateIndex
CREATE INDEX "customer_documents_tenantId_type_version_idx" ON "customer_documents"("tenantId", "type", "version");

-- CreateIndex
CREATE INDEX "customer_documents_tenantId_customerId_idx" ON "customer_documents"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "customer_consents_tenantId_customerId_idx" ON "customer_consents"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "customer_consents_tenantId_customerId_type_idx" ON "customer_consents"("tenantId", "customerId", "type");

-- CreateIndex
CREATE INDEX "customers_tenantId_birthDate_idx" ON "customers"("tenantId", "birthDate");

-- CreateIndex
CREATE INDEX "customers_tenantId_customerSource_idx" ON "customers"("tenantId", "customerSource");

-- AddForeignKey
ALTER TABLE "customer_health_profiles" ADD CONSTRAINT "customer_health_profiles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_health_profiles" ADD CONSTRAINT "customer_health_profiles_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_consents" ADD CONSTRAINT "customer_consents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_consents" ADD CONSTRAINT "customer_consents_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_consents" ADD CONSTRAINT "customer_consents_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "customer_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
