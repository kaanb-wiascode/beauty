import { Module } from '@nestjs/common';

import { OperationsResourcesController } from './operations-resources.controller';
import { OperationsResourcesService } from './operations-resources.service';

@Module({
  controllers: [OperationsResourcesController],
  providers: [OperationsResourcesService],
})
export class OperationsModule {}
