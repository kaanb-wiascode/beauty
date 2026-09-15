import { Module } from '@nestjs/common';

import { PlatformAuditModule } from '../platform-audit/platform-audit.module';
import { ApprovalDelegationService } from './approval-delegation.service';
import { ApprovalRuntimeService } from './approval-runtime.service';
import { ApprovalWorkflowController } from './approval-workflow.controller';
import { ApprovalWorkflowService } from './approval-workflow.service';

@Module({
  imports: [PlatformAuditModule],
  controllers: [ApprovalWorkflowController],
  providers: [ApprovalWorkflowService, ApprovalRuntimeService, ApprovalDelegationService],
  exports: [ApprovalWorkflowService, ApprovalRuntimeService],
})
export class ApprovalWorkflowModule {}
