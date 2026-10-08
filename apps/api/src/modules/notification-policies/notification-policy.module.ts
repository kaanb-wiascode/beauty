import { Module } from '@nestjs/common';

import { PlatformAuditModule } from '../platform-audit/platform-audit.module';
import { NotificationPolicyController } from './notification-policy.controller';
import { NotificationPolicyService } from './notification-policy.service';

@Module({
  imports: [PlatformAuditModule],
  controllers: [NotificationPolicyController],
  providers: [NotificationPolicyService],
  exports: [NotificationPolicyService],
})
export class NotificationPolicyModule {}
