import { Module } from '@nestjs/common';
import { CrmAutomationObservabilityService } from './crm-automation-observability.service';
import { CrmAutomationRulesController } from './crm-automation-rules.controller';
import { CrmAutomationRulesService } from './crm-automation-rules.service';
import { CrmAutomationSchedulerService } from './crm-automation-scheduler.service';
import { CrmAutomationService } from './crm-automation.service';
import { CrmCommercialController } from './crm-commercial.controller';
import { CrmController } from './crm.controller';
import { CrmCustomer360Service } from './crm-customer360.service';
import { CrmOperationsController } from './crm-operations.controller';
import { CrmOperationsService } from './crm-operations.service';
import { CrmOpportunityCommercialService } from './crm-opportunity-commercial.service';
import { CrmOpportunityService } from './crm-opportunity.service';
import { CrmReminderService } from './crm-reminder.service';
import { CrmService } from './crm.service';

@Module({
  controllers: [
    CrmController,
    CrmOperationsController,
    CrmCommercialController,
    CrmAutomationRulesController,
  ],
  providers: [
    CrmService,
    CrmOpportunityService,
    CrmOperationsService,
    CrmOpportunityCommercialService,
    CrmCustomer360Service,
    CrmReminderService,
    CrmAutomationRulesService,
    CrmAutomationService,
    CrmAutomationObservabilityService,
    CrmAutomationSchedulerService,
  ],
  exports: [CrmService, CrmOpportunityService, CrmOperationsService],
})
export class CrmModule {}
