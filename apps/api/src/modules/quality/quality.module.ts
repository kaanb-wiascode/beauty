import { Module } from '@nestjs/common';
import { QualityAssigneeScopeGuard } from './quality-assignee-scope.guard';
import { QualityController } from './quality.controller';
import { QualityFeedbackRequestController } from './quality-feedback-request.controller';
import { QualityFeedbackRequestService } from './quality-feedback-request.service';
import { QualitySlaService } from './quality-sla.service';
import { QualityService } from './quality.service';

@Module({
  controllers:[QualityController,QualityFeedbackRequestController],
  providers:[QualityService,QualitySlaService,QualityFeedbackRequestService,QualityAssigneeScopeGuard],
  exports:[QualityService,QualitySlaService,QualityFeedbackRequestService],
})
export class QualityModule {}
