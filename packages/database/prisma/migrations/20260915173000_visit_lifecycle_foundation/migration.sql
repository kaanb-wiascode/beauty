CREATE TYPE "VisitStatus" AS ENUM (
  'EXPECTED',
  'ARRIVED',
  'CHECKED_IN',
  'WAITING',
  'IN_SERVICE',
  'SERVICE_COMPLETED',
  'CHECKOUT_PENDING',
  'CHECKED_OUT',
  'CANCELLED'
);

CREATE TYPE "VisitSource" AS ENUM (
  'APPOINTMENT',
  'WALK_IN'
);

CREATE TABLE "visits" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "source" "VisitSource" NOT NULL,
  "status" "VisitStatus" NOT NULL DEFAULT 'EXPECTED',
  "note" TEXT,
  "idempotencyKey" VARCHAR(128),
  "arrivedAt" TIMESTAMP(3),
  "checkedInAt" TIMESTAMP(3),
  "serviceStartedAt" TIMESTAMP(3),
  "serviceCompletedAt" TIMESTAMP(3),
  "checkoutPendingAt" TIMESTAMP(3),
  "checkedOutAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdByMembershipId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "visits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "visits_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "visits_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "visits_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "visits_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "visits_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "visit_appointments" (
  "visitId" UUID NOT NULL,
  "appointmentId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "visit_appointments_pkey" PRIMARY KEY ("visitId", "appointmentId"),
  CONSTRAINT "visit_appointments_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "visit_appointments_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "visit_events" (
  "id" UUID NOT NULL,
  "visitId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "actorMembershipId" UUID NOT NULL,
  "eventType" VARCHAR(64) NOT NULL,
  "fromStatus" "VisitStatus",
  "toStatus" "VisitStatus",
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "visit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "visit_events_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "visit_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "visit_events_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "visit_events_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "visit_appointments_appointmentId_key" ON "visit_appointments"("appointmentId");
CREATE UNIQUE INDEX "visits_tenantId_branchId_idempotencyKey_key"
  ON "visits"("tenantId", "branchId", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;
CREATE INDEX "visits_tenantId_branchId_status_idx" ON "visits"("tenantId", "branchId", "status");
CREATE INDEX "visits_tenantId_branchId_createdAt_idx" ON "visits"("tenantId", "branchId", "createdAt");
CREATE INDEX "visits_tenantId_customerId_idx" ON "visits"("tenantId", "customerId");
CREATE INDEX "visit_events_visitId_createdAt_idx" ON "visit_events"("visitId", "createdAt");
CREATE INDEX "visit_events_tenantId_branchId_createdAt_idx" ON "visit_events"("tenantId", "branchId", "createdAt");
