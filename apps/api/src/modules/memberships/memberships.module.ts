import { Module } from '@nestjs/common';

import { PlatformAuditModule } from '../platform-audit/platform-audit.module';
import { TemporaryAccessModule } from '../temporary-access/temporary-access.module';
import { TenantEntitlementsModule } from '../tenant-entitlements/tenant-entitlements.module';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';

@Module({
  imports: [PlatformAuditModule, TemporaryAccessModule, TenantEntitlementsModule],
  controllers: [MembershipsController],
  providers: [MembershipsService],
})
export class MembershipsModule {}
