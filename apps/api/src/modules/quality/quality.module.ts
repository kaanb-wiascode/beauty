import { Module } from '@nestjs/common';
import { QualityController } from './quality.controller';
import { QualityPermissionGuard } from './quality-permission.guard';
import { QualityService } from './quality.service';

@Module({
  controllers:[QualityController],
  providers:[QualityService,QualityPermissionGuard],
  exports:[QualityService],
})
export class QualityModule {}
