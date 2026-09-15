import { Module } from '@nestjs/common';

import { PlatformAuditModule } from '../platform-audit/platform-audit.module';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  imports: [PlatformAuditModule],
  controllers: [RolesController],
  providers: [RolesService],
})
export class RolesModule {}
