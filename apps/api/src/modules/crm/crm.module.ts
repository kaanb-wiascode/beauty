import { Module } from '@nestjs/common';
import { CrmAutomationObservabilityService } from './crm-automation-observability.service';
import { CrmAutomationRulesController } from './crm-automation-rules.controller';
import { CrmAutomationRulesService } from './crm-automation-rules.service';
import { CrmAutomationSchedulerService } from './crm-automation-scheduler.service';
import { CrmAutomationService } from './crm-automation.service';
import { CrmCommercialController } from './crm-commercial.controller';
import { CrmController } from './crm.controller';
import { CrmCustomer360Service } from './crm-customer360.service';
import { CrmMessageController } from './crm-message.controller';
import { CrmMessageProviderRegistryService } from './crm-message-provider-registry.service';
import { CrmMessageService } from './crm-message.service';
import { CrmMessageWebhookController } from './crm-message-webhook.controller';
import { CrmMessageWebhookHistoryController } from './crm-message-webhook-history.controller';
import { CrmMessageWebhookHistoryService } from './crm-message-webhook-history.service';
import { CrmMessageWebhookService } from './crm-message-webhook.service';
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
    CrmMessageController,
    CrmMessageWebhookController,
    CrmMessageWebhookHistoryController,
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
    CrmMessageProviderRegistryService,
    CrmMessageService,
    CrmMessageWebhookService,
    CrmMessageWebhookHistoryService,
  ],
  exports: [
    CrmService,
    CrmOpportunityService,
    CrmOperationsService,
    CrmMessageService,
    CrmMessageProviderRegistryService,
  ],
})
export class CrmModule {}
