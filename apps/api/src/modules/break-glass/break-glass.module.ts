import { Module } from '@nestjs/common';

import { PlatformAuditModule } from '../platform-audit/platform-audit.module';
import { BreakGlassController } from './break-glass.controller';
import { BreakGlassService } from './break-glass.service';

@Module({
  imports: [PlatformAuditModule],
  controllers: [BreakGlassController],
  providers: [BreakGlassService],
})
export class BreakGlassModule {}
