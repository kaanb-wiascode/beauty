import { Module } from '@nestjs/common';

import { PlatformAuditModule } from '../platform-audit/platform-audit.module';
import { AdministrationGovernanceController } from './administration-governance.controller';
import { AdministrationGovernanceService } from './administration-governance.service';

@Module({
  imports: [PlatformAuditModule],
  controllers: [AdministrationGovernanceController],
  providers: [AdministrationGovernanceService],
  exports: [AdministrationGovernanceService],
})
export class AdministrationGovernanceModule {}
