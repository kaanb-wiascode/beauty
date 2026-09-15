import { Module } from '@nestjs/common';

import { OperationsAllocationService } from './operations-allocation.service';
import { OperationsCapacityService } from './operations-capacity.service';
import { OperationsResourcesController } from './operations-resources.controller';
import { OperationsResourcesService } from './operations-resources.service';
import { ServiceExecutionsController } from './service-executions.controller';
import { ServiceExecutionsService } from './service-executions.service';

@Module({
  controllers: [OperationsResourcesController, ServiceExecutionsController],
  providers: [
    OperationsResourcesService,
    OperationsAllocationService,
    OperationsCapacityService,
    ServiceExecutionsService,
  ],
})
export class OperationsModule {}
