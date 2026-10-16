import { Module } from '@nestjs/common';

import { TenantEntitlementsController } from './tenant-entitlements.controller';
import { TenantEntitlementsService } from './tenant-entitlements.service';
import { TenantQuotaService } from './tenant-quota.service';

@Module({
  controllers: [TenantEntitlementsController],
  providers: [TenantEntitlementsService, TenantQuotaService],
  exports: [TenantEntitlementsService, TenantQuotaService],
})
export class TenantEntitlementsModule {}
