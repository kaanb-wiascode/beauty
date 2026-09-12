import { Module } from '@nestjs/common';
import { CompetencyController } from './competency.controller';
import { CompetencyService } from './competency.service';
import { CompetencyTrainingController } from './competency-training.controller';
import { CompetencyTrainingService } from './competency-training.service';
import { LmsController } from './lms.controller';
import { LmsService } from './lms.service';
import { TrainingController } from './training.controller';
import { TrainingService } from './training.service';

@Module({
  controllers:[TrainingController,CompetencyController,CompetencyTrainingController,LmsController],
  providers:[TrainingService,CompetencyService,CompetencyTrainingService,LmsService],
  exports:[TrainingService,CompetencyService,CompetencyTrainingService,LmsService],
})
export class TrainingModule {}
