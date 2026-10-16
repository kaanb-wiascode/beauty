import { Module } from '@nestjs/common';

import { PlatformAuditModule } from '../platform-audit/platform-audit.module';
import { TemporaryAccessController } from './temporary-access.controller';
import { TemporaryAccessService } from './temporary-access.service';

@Module({
  imports: [PlatformAuditModule],
  controllers: [TemporaryAccessController],
  providers: [TemporaryAccessService],
  exports: [TemporaryAccessService],
})
export class TemporaryAccessModule {}
