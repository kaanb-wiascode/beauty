import { Module } from '@nestjs/common';
import { QualityAssigneeScopeGuard } from './quality-assignee-scope.guard';
import { QualityController } from './quality.controller';
import { QualityService } from './quality.service';

@Module({
  controllers:[QualityController],
  providers:[QualityService,QualityAssigneeScopeGuard],
  exports:[QualityService],
})
export class QualityModule {}
