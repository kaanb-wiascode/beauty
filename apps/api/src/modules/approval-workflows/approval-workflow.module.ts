import { Module } from '@nestjs/common';

import { PlatformAuditModule } from '../platform-audit/platform-audit.module';
import { ApprovalWorkflowController } from './approval-workflow.controller';
import { ApprovalWorkflowService } from './approval-workflow.service';

@Module({
  imports: [PlatformAuditModule],
  controllers: [ApprovalWorkflowController],
  providers: [ApprovalWorkflowService],
  exports: [ApprovalWorkflowService],
})
export class ApprovalWorkflowModule {}
