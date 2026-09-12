import { Module } from '@nestjs/common';
import { CompetencyController } from './competency.controller';
import { CompetencyService } from './competency.service';
import { CompetencyTrainingController } from './competency-training.controller';
import { CompetencyTrainingService } from './competency-training.service';
import { LmsController } from './lms.controller';
import { LmsService } from './lms.service';
import { TrainingCertificateController } from './training-certificate.controller';
import { TrainingCertificateService } from './training-certificate.service';
import { TrainingCompetencyBridgeController } from './training-competency-bridge.controller';
import { TrainingCompetencyBridgeService } from './training-competency-bridge.service';
import { TrainingEffectivenessController } from './training-effectiveness.controller';
import { TrainingEffectivenessService } from './training-effectiveness.service';
import { TrainingLessonProgressController } from './training-lesson-progress.controller';
import { TrainingLessonProgressService } from './training-lesson-progress.service';
import { TrainingController } from './training.controller';
import { TrainingService } from './training.service';

@Module({
  controllers:[TrainingController,CompetencyController,CompetencyTrainingController,LmsController,TrainingCertificateController,TrainingCompetencyBridgeController,TrainingEffectivenessController,TrainingLessonProgressController],
  providers:[TrainingService,CompetencyService,CompetencyTrainingService,LmsService,TrainingCertificateService,TrainingCompetencyBridgeService,TrainingEffectivenessService,TrainingLessonProgressService],
  exports:[TrainingService,CompetencyService,CompetencyTrainingService,LmsService,TrainingCertificateService,TrainingCompetencyBridgeService,TrainingEffectivenessService,TrainingLessonProgressService],
})
export class TrainingModule {}
