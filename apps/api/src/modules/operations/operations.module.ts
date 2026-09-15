import { Module } from '@nestjs/common';

import { CrmModule } from '../crm/crm.module';
import { HrModule } from '../hr/hr.module';
import { VisitsModule } from '../visits/visits.module';
import { OperationsAlertsController } from './operations-alerts.controller';
import { OperationsAlertsService } from './operations-alerts.service';
import { OperationsAllocationService } from './operations-allocation.service';
import { OperationsAppointmentOutcomesController } from './operations-appointment-outcomes.controller';
import { OperationsAppointmentOutcomesService } from './operations-appointment-outcomes.service';
import { OperationsBranchChecklistsController } from './operations-branch-checklists.controller';
import { OperationsBranchChecklistsService } from './operations-branch-checklists.service';
import { OperationsBranchWorkingHoursController } from './operations-branch-working-hours.controller';
import { OperationsBranchWorkingHoursService } from './operations-branch-working-hours.service';
import { OperationsCapacityService } from './operations-capacity.service';
import { OperationsConsumablesController } from './operations-consumables.controller';
import { OperationsConsumablesService } from './operations-consumables.service';
import { OperationsCustomerEngagementController } from './operations-customer-engagement.controller';
import { OperationsCustomerEngagementService } from './operations-customer-engagement.service';
import { OperationsIncidentsController } from './operations-incidents.controller';
import { OperationsIncidentsService } from './operations-incidents.service';
import { OperationsIntelligenceController } from './operations-intelligence.controller';
import { OperationsIntelligenceService } from './operations-intelligence.service';
import { OperationsOptimizationController } from './operations-optimization.controller';
import { OperationsOptimizationService } from './operations-optimization.service';
import { OperationsRebookingAnalyticsController } from './operations-rebooking-analytics.controller';
import { OperationsRebookingAnalyticsService } from './operations-rebooking-analytics.service';
import { OperationsRebookingController } from './operations-rebooking.controller';
import { OperationsRebookingService } from './operations-rebooking.service';
import { OperationsReliabilityController } from './operations-reliability.controller';
import { OperationsReliabilityService } from './operations-reliability.service';
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
import { OperationsStaffEligibilityController } from './operations-staff-eligibility.controller';
import { OperationsStaffEligibilityService } from './operations-staff-eligibility.service';
import { OperationsTimelineController } from './operations-timeline.controller';
import { OperationsTimelineService } from './operations-timeline.service';
import { OperationsUtilizationController } from './operations-utilization.controller';
import { OperationsUtilizationService } from './operations-utilization.service';
import { OperationsWaitlistController } from './operations-waitlist.controller';
import { OperationsWaitlistCandidateService } from './operations-waitlist-candidate.service';
import { OperationsWaitlistMatchingService } from './operations-waitlist-matching.service';
import { OperationsWaitlistRecoveryService } from './operations-waitlist-recovery.service';
import { OperationsWaitlistService } from './operations-waitlist.service';
import { ServiceExecutionCorrectionsController } from './service-execution-corrections.controller';
import { ServiceExecutionCorrectionsService } from './service-execution-corrections.service';
import { ServiceExecutionStaffController } from './service-execution-staff.controller';
import { ServiceExecutionStaffService } from './service-execution-staff.service';
import { ServiceExecutionsController } from './service-executions.controller';
import { ServiceExecutionsService } from './service-executions.service';

@Module({
  imports: [VisitsModule, CrmModule, HrModule],
  controllers: [
    OperationsResourcesController,
    OperationsResourceBlocksController,
    OperationsResourceCalendarController,
    OperationsConsumablesController,
    OperationsServiceChecklistsController,
    OperationsBranchChecklistsController,
    OperationsBranchWorkingHoursController,
    OperationsIncidentsController,
    OperationsAlertsController,
    OperationsAppointmentOutcomesController,
    OperationsRebookingController,
    OperationsRebookingAnalyticsController,
    OperationsCustomerEngagementController,
    OperationsReliabilityController,
    OperationsTimelineController,
    OperationsIntelligenceController,
    OperationsOptimizationController,
    OperationsStaffAvailabilityController,
    OperationsStaffEligibilityController,
    OperationsUtilizationController,
    OperationsWaitlistController,
    ServiceExecutionCorrectionsController,
    ServiceExecutionStaffController,
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
    OperationsBranchWorkingHoursService,
    OperationsIncidentsService,
    OperationsAlertsService,
    OperationsAppointmentOutcomesService,
    OperationsRebookingService,
    OperationsRebookingAnalyticsService,
    OperationsCustomerEngagementService,
    OperationsReliabilityService,
    OperationsTimelineService,
    OperationsIntelligenceService,
    OperationsOptimizationService,
    OperationsStaffAvailabilityService,
    OperationsStaffEligibilityService,
    OperationsUtilizationService,
    OperationsWaitlistService,
    OperationsWaitlistCandidateService,
    OperationsWaitlistMatchingService,
    OperationsWaitlistRecoveryService,
    ServiceExecutionCorrectionsService,
    ServiceExecutionStaffService,
    ServiceExecutionsService,
  ],
})
export class OperationsModule {}
