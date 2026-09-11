import { Module } from '@nestjs/common';
import { QualityAssigneeScopeGuard } from './quality-assignee-scope.guard';
import { QualityController } from './quality.controller';
import { QualityService } from './quality.service';
import { QualitySlaService } from './quality-sla.service';

@Module({
  controllers:[QualityController],
  providers:[QualityService,QualitySlaService,QualityAssigneeScopeGuard],
  exports:[QualityService,QualitySlaService],
})
export class QualityModule {}
