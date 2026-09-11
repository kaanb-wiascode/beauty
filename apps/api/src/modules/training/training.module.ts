import { Module } from '@nestjs/common';
import { CompetencyController } from './competency.controller';
import { CompetencyService } from './competency.service';
import { LmsController } from './lms.controller';
import { LmsService } from './lms.service';
import { TrainingController } from './training.controller';
import { TrainingService } from './training.service';

@Module({controllers:[TrainingController,CompetencyController,LmsController],providers:[TrainingService,CompetencyService,LmsService],exports:[TrainingService,CompetencyService,LmsService]})
export class TrainingModule {}
