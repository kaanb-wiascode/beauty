import { Module } from '@nestjs/common';
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
  controllers: [CrmController, CrmOperationsController, CrmCommercialController],
  providers: [
    CrmService,
    CrmOpportunityService,
    CrmOperationsService,
    CrmOpportunityCommercialService,
    CrmCustomer360Service,
    CrmReminderService,
    CrmAutomationService,
  ],
  exports: [CrmService, CrmOpportunityService, CrmOperationsService],
})
export class CrmModule {}
