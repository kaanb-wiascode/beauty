import { Module } from '@nestjs/common';

import { VisitsModule } from '../visits/visits.module';
import { OperationsAlertsController } from './operations-alerts.controller';
import { OperationsAlertsService } from './operations-alerts.service';
import { OperationsAllocationService } from './operations-allocation.service';
import { OperationsAppointmentOutcomesController } from './operations-appointment-outcomes.controller';
import { OperationsAppointmentOutcomesService } from './operations-appointment-outcomes.service';
import { OperationsBranchChecklistsController } from './operations-branch-checklists.controller';
import { OperationsBranchChecklistsService } from './operations-branch-checklists.service';
import { OperationsCapacityService } from './operations-capacity.service';
import { OperationsConsumablesController } from './operations-consumables.controller';
import { OperationsConsumablesService } from './operations-consumables.service';
import { OperationsIncidentsController } from './operations-incidents.controller';
import { OperationsIncidentsService } from './operations-incidents.service';
import { OperationsRebookingAnalyticsController } from './operations-rebooking-analytics.controller';
import { OperationsRebookingAnalyticsService } from './operations-rebooking-analytics.service';
import { OperationsRebookingController } from './operations-rebooking.controller';
import { OperationsRebookingService } from './operations-rebooking.service';
import { OperationsResourceBlocksController } from './operations-resource-blocks.controller';
import { OperationsResourceBlocksService } from './operations-resource-blocks.service';
import { OperationsResourceCalendarController } from './operations-resource-calendar.controller';
import { OperationsResourceCalendarService } from './operations-resource-calendar.service';
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
  imports: [VisitsModule],
  controllers: [
    OperationsResourcesController,
    OperationsResourceBlocksController,
    OperationsResourceCalendarController,
    OperationsConsumablesController,
    OperationsServiceChecklistsController,
    OperationsBranchChecklistsController,
    OperationsIncidentsController,
    OperationsAlertsController,
    OperationsAppointmentOutcomesController,
    OperationsRebookingController,
    OperationsRebookingAnalyticsController,
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
    OperationsResourceCalendarService,
    OperationsConsumablesService,
    OperationsServiceChecklistsService,
    OperationsBranchChecklistsService,
    OperationsIncidentsService,
    OperationsAlertsService,
    OperationsAppointmentOutcomesService,
    OperationsRebookingService,
    OperationsRebookingAnalyticsService,
    OperationsStaffAvailabilityService,
    OperationsUtilizationService,
    OperationsWaitlistService,
    OperationsWaitlistMatchingService,
    OperationsWaitlistRecoveryService,
    ServiceExecutionsService,
  ],
})
export class OperationsModule {}
