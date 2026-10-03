import { Global, Module } from '@nestjs/common';
import { OrganizationScopeService } from './organization-scope.service';
import { TenantContext } from './tenant-context';
import { TenantEntitlementQuotaService } from './tenant-entitlement-quota.service';

@Global()
@Module({
  providers: [
    TenantContext,
    OrganizationScopeService,
    TenantEntitlementQuotaService,
  ],
  exports: [
    TenantContext,
    OrganizationScopeService,
    TenantEntitlementQuotaService,
  ],
})
export class TenantModule {}
