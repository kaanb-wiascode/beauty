import { Module } from '@nestjs/common';

import { PlatformAuditModule } from '../platform-audit/platform-audit.module';
import { BusinessPolicyController } from './business-policy.controller';
import { BusinessPolicyService } from './business-policy.service';

@Module({
  imports:[PlatformAuditModule],
  controllers:[BusinessPolicyController],
  providers:[BusinessPolicyService],
  exports:[BusinessPolicyService],
})
export class BusinessPolicyModule{}
