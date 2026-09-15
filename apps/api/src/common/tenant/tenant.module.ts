import { Global, Module } from '@nestjs/common';
import { OrganizationScopeService } from './organization-scope.service';
import { TenantContext } from './tenant-context';

@Global()
@Module({
  providers: [TenantContext, OrganizationScopeService],
  exports: [TenantContext, OrganizationScopeService],
})
export class TenantModule {}
