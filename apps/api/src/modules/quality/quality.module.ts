import { Module } from '@nestjs/common';
import { QualityAssigneeScopeGuard } from './quality-assignee-scope.guard';
import { QualityController } from './quality.controller';
import { QualityFeedbackRequestController } from './quality-feedback-request.controller';
import { QualityFeedbackRequestService } from './quality-feedback-request.service';
import { QualityNotificationOutboxController } from './quality-notification-outbox.controller';
import { QualityNotificationOutboxService } from './quality-notification-outbox.service';
import { QualitySlaService } from './quality-sla.service';
import { QualityService } from './quality.service';

@Module({
  controllers:[QualityController,QualityFeedbackRequestController,QualityNotificationOutboxController],
  providers:[QualityService,QualitySlaService,QualityFeedbackRequestService,QualityNotificationOutboxService,QualityAssigneeScopeGuard],
  exports:[QualityService,QualitySlaService,QualityFeedbackRequestService,QualityNotificationOutboxService],
})
export class QualityModule {}
