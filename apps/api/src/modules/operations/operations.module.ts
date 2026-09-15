import { Module } from '@nestjs/common';

import { OperationsAlertsController } from './operations-alerts.controller';
import { OperationsAlertsService } from './operations-alerts.service';
import { OperationsAllocationService } from './operations-allocation.service';
import { OperationsBranchChecklistsController } from './operations-branch-checklists.controller';
import { OperationsBranchChecklistsService } from './operations-branch-checklists.service';
import { OperationsCapacityService } from './operations-capacity.service';
import { OperationsConsumablesController } from './operations-consumables.controller';
import { OperationsConsumablesService } from './operations-consumables.service';
import { OperationsIncidentsController } from './operations-incidents.controller';
import { OperationsIncidentsService } from './operations-incidents.service';
import { OperationsResourceBlocksController } from './operations-resource-blocks.controller';
import { OperationsResourceBlocksService } from './operations-resource-blocks.service';
import { OperationsResourcesController } from './operations-resources.controller';
import { OperationsResourcesService } from './operations-resources.service';
import { OperationsServiceChecklistsController } from './operations-service-checklists.controller';
import { OperationsServiceChecklistsService } from './operations-service-checklists.service';
import { OperationsStaffAvailabilityController } from './operations-staff-availability.controller';
import { OperationsStaffAvailabilityService } from './operations-staff-availability.service';
import { OperationsUtilizationController } from './operations-utilization.controller';
import { OperationsUtilizationService } from './operations-utilization.service';
import { OperationsWaitlistController } from './operations-waitlist.controller';
import { OperationsWaitlistMatchingService } from './operations-waitlist-matching.service';
import { OperationsWaitlistRecoveryService } from './operations-waitlist-recovery.service';
import { OperationsWaitlistService } from './operations-waitlist.service';
import { ServiceExecutionsController } from './service-executions.controller';
import { ServiceExecutionsService } from './service-executions.service';

@Module({
  controllers: [
    OperationsResourcesController,
    OperationsResourceBlocksController,
    OperationsConsumablesController,
    OperationsServiceChecklistsController,
    OperationsBranchChecklistsController,
    OperationsIncidentsController,
    OperationsAlertsController,
    OperationsStaffAvailabilityController,
    OperationsUtilizationController,
    OperationsWaitlistController,
    ServiceExecutionsController,
  ],
  providers: [
    OperationsResourcesService,
    OperationsAllocationService,
    OperationsCapacityService,
    OperationsResourceBlocksService,
    OperationsConsumablesService,
    OperationsServiceChecklistsService,
    OperationsBranchChecklistsService,
    OperationsIncidentsService,
    OperationsAlertsService,
    OperationsStaffAvailabilityService,
    OperationsUtilizationService,
    OperationsWaitlistService,
    OperationsWaitlistMatchingService,
    OperationsWaitlistRecoveryService,
    ServiceExecutionsService,
  ],
})
export class OperationsModule {}
