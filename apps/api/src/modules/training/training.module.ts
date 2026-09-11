import { Module } from '@nestjs/common';
import { CompetencyController } from './competency.controller';
import { CompetencyService } from './competency.service';
import { TrainingController } from './training.controller';
import { TrainingService } from './training.service';

@Module({controllers:[TrainingController,CompetencyController],providers:[TrainingService,CompetencyService],exports:[TrainingService,CompetencyService]})
export class TrainingModule {}
