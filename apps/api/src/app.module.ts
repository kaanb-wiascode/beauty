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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (config) => envSchema.parse(config),
    }),
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
  ],
})
export class AppModule {}
