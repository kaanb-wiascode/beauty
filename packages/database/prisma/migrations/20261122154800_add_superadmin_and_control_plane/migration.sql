-- CreateEnum
CREATE TYPE "PlatformAdminRole" AS ENUM ('SUPER_ADMIN', 'SECURITY_ADMIN', 'SUPPORT_AGENT', 'BILLING_ADMIN');

-- CreateEnum
CREATE TYPE "PlatformModuleCategory" AS ENUM ('CORE', 'OPERATIONS', 'FINANCE', 'MARKETING', 'CLINICAL', 'INTELLIGENCE');

-- CreateEnum
CREATE TYPE "TenantModuleStatus" AS ENUM ('ACTIVE', 'TRIAL', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('TABLET', 'MOBILE', 'DESKTOP', 'OTHER');

-- CreateEnum
CREATE TYPE "DeviceApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'BLOCKED', 'REVOKED');

-- CreateEnum
CREATE TYPE "IpRestrictionMode" AS ENUM ('DISABLED', 'RELAXED', 'STRICT');

-- CreateEnum
CREATE TYPE "DeviceRestrictionMode" AS ENUM ('DISABLED', 'ALERT_ONLY', 'STRICT_BLOCK');

-- CreateTable
CREATE TABLE "platform_admins" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "PlatformAdminRole" NOT NULL DEFAULT 'SUPPORT_AGENT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_modules" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "PlatformModuleCategory" NOT NULL DEFAULT 'OPERATIONS',
    "basePriceMonthly" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "basePriceYearly" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "isCore" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_modules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "status" "TenantModuleStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "price" DECIMAL(65,30),
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_devices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceIdentifier" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "deviceType" "DeviceType" NOT NULL DEFAULT 'TABLET',
    "osInfo" TEXT,
    "browserInfo" TEXT,
    "lastIpAddress" TEXT NOT NULL,
    "status" "DeviceApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approvedAt" TIMESTAMP(3),
    "approvedByAdminId" TEXT,
    "rejectionReason" TEXT,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_allowed_ips" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "ipAddress" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_allowed_ips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_security_policies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ipRestrictionMode" "IpRestrictionMode" NOT NULL DEFAULT 'RELAXED',
    "deviceRestrictionMode" "DeviceRestrictionMode" NOT NULL DEFAULT 'STRICT_BLOCK',
    "allowDoctorRemoteAccess" BOOLEAN NOT NULL DEFAULT true,
    "maxAllowedDevices" INTEGER NOT NULL DEFAULT 10,
    "autoBlockOnExportSpike" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_security_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_audit_logs" (
    "id" TEXT NOT NULL,
    "platformAdminId" TEXT,
    "tenantId" TEXT,
    "action" TEXT NOT NULL,
    "targetEntity" TEXT NOT NULL,
    "targetId" TEXT,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impersonation_sessions" (
    "id" TEXT NOT NULL,
    "platformAdminId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "isCustomerApproved" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "ipAddress" TEXT NOT NULL,

    CONSTRAINT "impersonation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_admins_email_key" ON "platform_admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "platform_modules_code_key" ON "platform_modules"("code");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_modules_tenantId_moduleId_key" ON "tenant_modules"("tenantId", "moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_devices_tenantId_deviceIdentifier_key" ON "tenant_devices"("tenantId", "deviceIdentifier");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_security_policies_tenantId_key" ON "tenant_security_policies"("tenantId");

-- AddForeignKey
ALTER TABLE "tenant_modules" ADD CONSTRAINT "tenant_modules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_modules" ADD CONSTRAINT "tenant_modules_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "platform_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_devices" ADD CONSTRAINT "tenant_devices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_devices" ADD CONSTRAINT "tenant_devices_approvedByAdminId_fkey" FOREIGN KEY ("approvedByAdminId") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_allowed_ips" ADD CONSTRAINT "tenant_allowed_ips_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_security_policies" ADD CONSTRAINT "tenant_security_policies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_platformAdminId_fkey" FOREIGN KEY ("platformAdminId") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_platformAdminId_fkey" FOREIGN KEY ("platformAdminId") REFERENCES "platform_admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
