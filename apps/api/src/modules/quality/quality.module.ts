import { Module } from '@nestjs/common';
import { ObjectStorageModule } from '../../common/storage/object-storage.module';
import { QualityAnalyticsController } from './quality-analytics.controller';
import { QualityAnalyticsService } from './quality-analytics.service';
import { QualityAssigneeScopeGuard } from './quality-assignee-scope.guard';
import { QualityBranchScoreAnalyticsController } from './quality-branch-score-analytics.controller';
import { QualityBranchScoreAnalyticsService } from './quality-branch-score-analytics.service';
import { QualityCapaController } from './quality-capa.controller';
import { QualityCapaService } from './quality-capa.service';
import { QualityController } from './quality.controller';
import { QualityEvidenceController } from './quality-evidence.controller';
import { QualityEvidenceService } from './quality-evidence.service';
import { QualityFeedbackRequestController } from './quality-feedback-request.controller';
import { QualityFeedbackRequestService } from './quality-feedback-request.service';
import { QualityInspectionCatalogController } from './quality-inspection-catalog.controller';
import { QualityInspectionCatalogService } from './quality-inspection-catalog.service';
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
import { QualityScoreController } from './quality-score.controller';
import { QualityScoreSchedulerController } from './quality-score-scheduler.controller';
import { QualityScoreSchedulerService } from './quality-score-scheduler.service';
import { QualityScoreService } from './quality-score.service';
import { QualitySlaPolicyController } from './quality-sla-policy.controller';
import { QualitySlaService } from './quality-sla.service';
import { QualityService } from './quality.service';

@Module({
  imports: [ObjectStorageModule],
  controllers: [
    QualityController,
    QualityFeedbackRequestController,
    QualityNotificationOutboxController,
    QualityPublicFeedbackController,
    QualityInspectionController,
    QualityInspectionCatalogController,
    QualityCapaController,
    QualityInspectionSchedulerController,
    QualityOverdueController,
    QualityEvidenceController,
    QualityScoreController,
    QualityScoreSchedulerController,
    QualitySlaPolicyController,
    QualityAnalyticsController,
    QualityBranchScoreAnalyticsController,
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
    QualityInspectionCatalogService,
    QualityCapaService,
    QualityInspectionSchedulerService,
    QualityOverdueService,
    QualityEvidenceService,
    QualityScoreService,
    QualityScoreSchedulerService,
    QualityAnalyticsService,
    QualityBranchScoreAnalyticsService,
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
    QualityInspectionCatalogService,
    QualityCapaService,
    QualityInspectionSchedulerService,
    QualityOverdueService,
    QualityEvidenceService,
    QualityScoreService,
    QualityScoreSchedulerService,
    QualityAnalyticsService,
    QualityBranchScoreAnalyticsService,
  ],
})
export class QualityModule {}
