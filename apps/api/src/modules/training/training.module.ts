import { Module } from '@nestjs/common';
import { ObjectStorageModule } from '../../common/storage/object-storage.module';
import { CompetencyController } from './competency.controller';
import { CompetencyService } from './competency.service';
import { CompetencyReviewController } from './competency-review.controller';
import { CompetencyReviewService } from './competency-review.service';
import { CompetencyTrainingController } from './competency-training.controller';
import { CompetencyTrainingService } from './competency-training.service';
import { LmsController } from './lms.controller';
import { LmsService } from './lms.service';
import { PositionCompetencyController } from './position-competency.controller';
import { PositionCompetencyService } from './position-competency.service';
import { TrainingAnalyticsController } from './training-analytics.controller';
import { TrainingAnalyticsService } from './training-analytics.service';
import { TrainingBranchAnalyticsController } from './training-branch-analytics.controller';
import { TrainingBranchAnalyticsService } from './training-branch-analytics.service';
import { TrainingCertificateController } from './training-certificate.controller';
import { TrainingCertificateService } from './training-certificate.service';
import { TrainingCompetencyBridgeController } from './training-competency-bridge.controller';
import { TrainingCompetencyBridgeService } from './training-competency-bridge.service';
import { TrainingContentStorageController } from './training-content-storage.controller';
import { TrainingContentStorageService } from './training-content-storage.service';
import { TrainingEffectivenessController } from './training-effectiveness.controller';
import { TrainingEffectivenessService } from './training-effectiveness.service';
import { TrainingLessonProgressController } from './training-lesson-progress.controller';
import { TrainingLessonProgressService } from './training-lesson-progress.service';
import { TrainingPlanningController } from './training-planning.controller';
import { TrainingPlanningService } from './training-planning.service';
import { TrainingProgramController } from './training-program.controller';
import { TrainingProgramService } from './training-program.service';
import { TrainingQuestionBankController } from './training-question-bank.controller';
import { TrainingQuestionBankService } from './training-question-bank.service';
import { TrainingController } from './training.controller';
import { TrainingService } from './training.service';

@Module({
  imports: [ObjectStorageModule],
  controllers:[TrainingController,TrainingAnalyticsController,TrainingBranchAnalyticsController,TrainingQuestionBankController,TrainingContentStorageController,CompetencyController,CompetencyReviewController,CompetencyTrainingController,LmsController,PositionCompetencyController,TrainingCertificateController,TrainingCompetencyBridgeController,TrainingEffectivenessController,TrainingLessonProgressController,TrainingPlanningController,TrainingProgramController],
  providers:[TrainingService,TrainingAnalyticsService,TrainingBranchAnalyticsService,TrainingQuestionBankService,TrainingContentStorageService,CompetencyService,CompetencyReviewService,CompetencyTrainingService,LmsService,PositionCompetencyService,TrainingCertificateService,TrainingCompetencyBridgeService,TrainingEffectivenessService,TrainingLessonProgressService,TrainingPlanningService,TrainingProgramService],
  exports:[TrainingService,TrainingAnalyticsService,TrainingBranchAnalyticsService,TrainingQuestionBankService,TrainingContentStorageService,CompetencyService,CompetencyReviewService,CompetencyTrainingService,LmsService,PositionCompetencyService,TrainingCertificateService,TrainingCompetencyBridgeService,TrainingEffectivenessService,TrainingLessonProgressService,TrainingPlanningService,TrainingProgramService],
})
export class TrainingModule {}
