import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@beauty-erp/database';
import { envSchema } from './config/env.schema';
import { HealthModule } from './modules/health/health.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantModule } from './common/tenant/tenant.module';
import { CustomersModule } from './modules/customers/customers.module';
import { StaffModule } from './modules/staff/staff.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { ServicesModule } from './modules/services/services.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RolesModule } from './modules/roles/roles.module';
import { MembershipsModule } from './modules/memberships/memberships.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { HrModule } from './modules/hr/hr.module';
import { PackagesModule } from './modules/packages/packages.module';
import { SalesModule } from './modules/sales/sales.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { CustomerLedgerModule } from './modules/customer-ledger/customer-ledger.module';
import { InstallmentsModule } from './modules/installments/installments.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { AccountsPayableModule } from './modules/accounts-payable/accounts-payable.module';
import { ProcurementModule } from './modules/procurement/procurement.module';
import { ProfitabilityModule } from './modules/profitability/profitability.module';
import { FinancialIntegrationsModule } from './modules/financial-integrations/financial-integrations.module';
import { IntegrationAdminModule } from './modules/integration-admin/integration-admin.module';
import { FinanceModule } from './modules/finance/finance.module';
import { PlatformAuditModule } from './modules/platform-audit/platform-audit.module';
import { PlatformControlPlaneModule } from './modules/platform-control-plane/platform-control-plane.module';
import { OrganizationAdminModule } from './modules/organization-admin/organization-admin.module';
import { TemporaryAccessModule } from './modules/temporary-access/temporary-access.module';
import { ApprovalWorkflowModule } from './modules/approval-workflows/approval-workflow.module';
import { BusinessPolicyModule } from './modules/business-policies/business-policy.module';
import { AdministrationGovernanceModule } from './modules/administration-governance/administration-governance.module';
import { BreakGlassModule } from './modules/break-glass/break-glass.module';
import { AdminDashboardModule } from './modules/admin-dashboard/admin-dashboard.module';
import { FieldSecurityModule } from './modules/field-security/field-security.module';
import { NotificationPolicyModule } from './modules/notification-policies/notification-policy.module';
import { TaxModule } from './modules/tax/tax.module';
import { MarketplaceModule } from './modules/marketplace/marketplace.module';
import { SupplierNetworkModule } from './modules/supplier-network/supplier-network.module';
import { QualityModule } from './modules/quality/quality.module';
import { TrainingModule } from './modules/training/training.module';
import { CrmModule } from './modules/crm/crm.module';
import { VisitsModule } from './modules/visits/visits.module';
import { OperationsModule } from './modules/operations/operations.module';
import { CorporateCommunicationsModule } from './modules/corporate-communications/corporate-communications.module';
import { MarketingVendorsController } from './modules/corporate-communications/marketing-vendors.controller';
import { MarketingVendorsService } from './modules/corporate-communications/marketing-vendors.service';
import { CreatorsController } from './modules/corporate-communications/creators.controller';
import { CreatorsService } from './modules/corporate-communications/creators.service';
import { PrMediaController } from './modules/corporate-communications/pr-media.controller';
import { PrMediaService } from './modules/corporate-communications/pr-media.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: (config) => envSchema.parse(config) }),
    DatabaseModule,
    RedisModule,
    AuthModule,
    TenantModule,
    HealthModule,
    CustomersModule,
    StaffModule,
    AppointmentsModule,
    ServicesModule,
    PaymentsModule,
    ReportsModule,
    RolesModule,
    MembershipsModule,
    InventoryModule,
    HrModule,
    PackagesModule,
    SalesModule,
    SessionsModule,
    CustomerLedgerModule,
    InstallmentsModule,
    AccountingModule,
    AccountsPayableModule,
    ProcurementModule,
    ProfitabilityModule,
    FinancialIntegrationsModule,
    IntegrationAdminModule,
    FinanceModule,
    PlatformAuditModule,
    PlatformControlPlaneModule,
    OrganizationAdminModule,
    TemporaryAccessModule,
    ApprovalWorkflowModule,
    BusinessPolicyModule,
    AdministrationGovernanceModule,
    BreakGlassModule,
    AdminDashboardModule,
    FieldSecurityModule,
    NotificationPolicyModule,
    TaxModule,
    MarketplaceModule,
    SupplierNetworkModule,
    QualityModule,
    TrainingModule,
    CrmModule,
    VisitsModule,
    OperationsModule,
    CorporateCommunicationsModule,
  ],
  controllers: [MarketingVendorsController, CreatorsController, PrMediaController],
  providers: [MarketingVendorsService, CreatorsService, PrMediaService],
})
export class AppModule {}
