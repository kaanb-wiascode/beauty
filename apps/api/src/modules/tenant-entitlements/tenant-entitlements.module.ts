import { Module } from '@nestjs/common';

import { TenantEntitlementsController } from './tenant-entitlements.controller';
import { TenantEntitlementsService } from './tenant-entitlements.service';

@Module({
  controllers: [TenantEntitlementsController],
  providers: [TenantEntitlementsService],
  exports: [TenantEntitlementsService],
})
export class TenantEntitlementsModule {}
