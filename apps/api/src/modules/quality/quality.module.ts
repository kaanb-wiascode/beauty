import { Module } from '@nestjs/common';
import { QualityAssigneeScopeGuard } from './quality-assignee-scope.guard';
import { QualityCapaController } from './quality-capa.controller';
import { QualityCapaService } from './quality-capa.service';
import { QualityController } from './quality.controller';
import { QualityEvidenceController } from './quality-evidence.controller';
import { QualityEvidenceService } from './quality-evidence.service';
import { QualityFeedbackRequestController } from './quality-feedback-request.controller';
import { QualityFeedbackRequestService } from './quality-feedback-request.service';
import { QualityInspectionController } from './quality-inspection.controller';
import { QualityInspectionService } from './quality-inspection.service';
import { QualityInspectionSchedulerController } from './quality-inspection-scheduler.controller';
import { QualityInspectionSchedulerService } from './quality-inspection-scheduler.service';
import { QualityNotificationDispatcherService } from './quality-notification-dispatcher.service';
import { QualityNotificationOutboxController } from './quality-notification-outbox.controller';
import { QualityNotificationOutboxService } from './quality-notification-outbox.service';
import { QualityNotificationWebhookProvider } from './quality-notification-webhook.provider';
import { QualityOverdueController } from './quality-overdue.controller';
import { QualityOverdueService } from './quality-overdue.service';
import { QualityPublicFeedbackController } from './quality-public-feedback.controller';
import { QualityPublicFeedbackService } from './quality-public-feedback.service';
import { QualitySlaService } from './quality-sla.service';
import { QualityService } from './quality.service';

@Module({
  controllers: [
    QualityController,
    QualityFeedbackRequestController,
    QualityNotificationOutboxController,
    QualityPublicFeedbackController,
    QualityInspectionController,
    QualityCapaController,
    QualityInspectionSchedulerController,
    QualityOverdueController,
    QualityEvidenceController,
  ],
  providers: [
    QualityService,
    QualitySlaService,
    QualityFeedbackRequestService,
    QualityNotificationOutboxService,
    QualityNotificationDispatcherService,
    QualityNotificationWebhookProvider,
    QualityPublicFeedbackService,
    QualityInspectionService,
    QualityCapaService,
    QualityInspectionSchedulerService,
    QualityOverdueService,
    QualityEvidenceService,
    QualityAssigneeScopeGuard,
  ],
  exports: [
    QualityService,
    QualitySlaService,
    QualityFeedbackRequestService,
    QualityNotificationOutboxService,
    QualityNotificationDispatcherService,
    QualityPublicFeedbackService,
    QualityInspectionService,
    QualityCapaService,
    QualityInspectionSchedulerService,
    QualityOverdueService,
    QualityEvidenceService,
  ],
})
export class QualityModule {}
