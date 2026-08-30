-- CreateEnum
CREATE TYPE "CustomerCareEventType" AS ENUM ('REACTION', 'AFTERCARE', 'COMPLAINT', 'FOLLOW_UP', 'INCIDENT', 'NOTE');

-- CreateEnum
CREATE TYPE "CustomerCareEventStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CustomerCary" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "CustomerCareSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "customer_care_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "staffId" TEXT,
    "type" "CustomerCareEventType" NOT NULL,
    "status" "CustomerCareEventStatus" NOT NULL DEFAULT 'OPEN',
    "severity" "CustomerCareSeverity",
    "title" TEXT NOT NULL,
    "description" TEXT,
    "onsetAt" TIMESTAMP(3),
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actionTaken" TEXT,
    "followUpAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_care_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_care_events_tenantId_customerId_occurredAt_idx" ON "customer_care_events"("tenantId", "customerId", "occurredAt");

-- CreateIndex
CREATE INDEX "customer_care_events_tenantId_customerId_status_idx" ON "customer_care_events"("tenantId", "customerId", "status");

-- CreateIndex
CREATE INDEX "customer_care_events_tenantId_type_idx" ON "customer_care_events"("tenantId", "type");

-- CreateIndex
CREATE INDEX "customer_care_events_tenantId_followUpAt_idx" ON "customer_care_events"("tenantId", "followUpAt");

-- AddForeignKey
ALTER TABLE "customer_care_events" ADD CONSTRAINT "customer_care_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_care_events" ADD CONSTRAINT "customer_care_events_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_care_events" ADD CONSTRAINT "customer_care_events_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_care_events" ADD CONSTRAINT "customer_care_events_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
