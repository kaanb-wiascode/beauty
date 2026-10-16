import { Module } from '@nestjs/common';

import { PlatformAuditService } from './platform-audit.service';
import { TenantAuditController } from './tenant-audit.controller';

@Module({
  controllers: [TenantAuditController],
  providers: [PlatformAuditService],
  exports: [PlatformAuditService],
})
export class PlatformAuditModule {}
