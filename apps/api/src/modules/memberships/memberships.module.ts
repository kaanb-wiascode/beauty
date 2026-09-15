import { Module } from '@nestjs/common';

import { PlatformAuditModule } from '../platform-audit/platform-audit.module';
import { TemporaryAccessModule } from '../temporary-access/temporary-access.module';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';

@Module({
  imports: [PlatformAuditModule, TemporaryAccessModule],
  controllers: [MembershipsController],
  providers: [MembershipsService],
})
export class MembershipsModule {}
