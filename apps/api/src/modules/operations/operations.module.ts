import { Module } from '@nestjs/common';

import { OperationsAllocationService } from './operations-allocation.service';
import { OperationsCapacityService } from './operations-capacity.service';
import { OperationsResourcesController } from './operations-resources.controller';
import { OperationsResourcesService } from './operations-resources.service';

@Module({
  controllers: [OperationsResourcesController],
  providers: [
    OperationsResourcesService,
    OperationsAllocationService,
    OperationsCapacityService,
  ],
})
export class OperationsModule {}
