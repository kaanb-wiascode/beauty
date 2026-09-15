import { Module } from '@nestjs/common';

import { OperationsAllocationService } from './operations-allocation.service';
import { OperationsCapacityService } from './operations-capacity.service';
import { OperationsResourceBlocksController } from './operations-resource-blocks.controller';
import { OperationsResourceBlocksService } from './operations-resource-blocks.service';
import { OperationsResourcesController } from './operations-resources.controller';
import { OperationsResourcesService } from './operations-resources.service';
import { ServiceExecutionsController } from './service-executions.controller';
import { ServiceExecutionsService } from './service-executions.service';

@Module({
  controllers: [
    OperationsResourcesController,
    OperationsResourceBlocksController,
    ServiceExecutionsController,
  ],
  providers: [
    OperationsResourcesService,
    OperationsAllocationService,
    OperationsCapacityService,
    OperationsResourceBlocksService,
    ServiceExecutionsService,
  ],
})
export class OperationsModule {}
