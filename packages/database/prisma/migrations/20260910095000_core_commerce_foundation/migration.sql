-- Core commerce foundation: packages, sales, customer packages and sessions

CREATE TYPE "SaleStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');
CREATE TYPE "SaleItemType" AS ENUM ('SERVICE', 'PACKAGE');
CREATE TYPE "CustomerPackageStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "SessionStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'CONSUMED', 'CANCELLED');

CREATE TABLE "service_packages" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "price" DECIMAL(10,2) NOT NULL,
  "validityDays" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "service_packages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "package_items" (
  "id" TEXT NOT NULL,
  "packageId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "package_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "status" "SaleStatus" NOT NULL DEFAULT 'DRAFT',
  "subtotal" DECIMAL(10,2) NOT NULL,
  "discountTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(10,2) NOT NULL,
  "confirmedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sale_items" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "type" "SaleItemType" NOT NULL,
  "serviceId" TEXT,
  "packageId" TEXT,
  "description" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unitPrice" DECIMAL(10,2) NOT NULL,
  "lineTotal" DECIMAL(10,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_packages" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "packageId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "status" "CustomerPackageStatus" NOT NULL DEFAULT 'ACTIVE',
  "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_packages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessions" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "customerPackageId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "appointmentId" TEXT,
  "status" "SessionStatus" NOT NULL DEFAULT 'AVAILABLE',
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "package_items_packageId_serviceId_key" ON "package_items"("packageId", "serviceId");
CREATE UNIQUE INDEX "sessions_appointmentId_key" ON "sessions"("appointmentId");

CREATE INDEX "service_packages_tenantId_branchId_idx" ON "service_packages"("tenantId", "branchId");
CREATE INDEX "service_packages_tenantId_active_idx" ON "service_packages"("tenantId", "active");
CREATE INDEX "package_items_serviceId_idx" ON "package_items"("serviceId");
CREATE INDEX "sales_tenantId_branchId_createdAt_idx" ON "sales"("tenantId", "branchId", "createdAt");
CREATE INDEX "sales_tenantId_customerId_idx" ON "sales"("tenantId", "customerId");
CREATE INDEX "sales_tenantId_status_idx" ON "sales"("tenantId", "status");
CREATE INDEX "sale_items_saleId_idx" ON "sale_items"("saleId");
CREATE INDEX "customer_packages_tenantId_customerId_idx" ON "customer_packages"("tenantId", "customerId");
CREATE INDEX "customer_packages_tenantId_status_idx" ON "customer_packages"("tenantId", "status");
CREATE INDEX "sessions_tenantId_customerPackageId_status_idx" ON "sessions"("tenantId", "customerPackageId", "status");
CREATE INDEX "sessions_tenantId_serviceId_status_idx" ON "sessions"("tenantId", "serviceId", "status");

ALTER TABLE "service_packages" ADD CONSTRAINT "service_packages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_packages" ADD CONSTRAINT "service_packages_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "service_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "service_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_packages" ADD CONSTRAINT "customer_packages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_packages" ADD CONSTRAINT "customer_packages_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_packages" ADD CONSTRAINT "customer_packages_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_packages" ADD CONSTRAINT "customer_packages_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "service_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_packages" ADD CONSTRAINT "customer_packages_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_customerPackageId_fkey" FOREIGN KEY ("customerPackageId") REFERENCES "customer_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
