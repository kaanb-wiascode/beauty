import { Module } from '@nestjs/common';
import { CrmAutomationMessageActionService } from './crm-automation-message-action.service';
import { CrmAutomationObservabilityService } from './crm-automation-observability.service';
import { CrmAutomationRulesController } from './crm-automation-rules.controller';
import { CrmAutomationRulesService } from './crm-automation-rules.service';
import { CrmAutomationSchedulerService } from './crm-automation-scheduler.service';
import { CrmAutomationService } from './crm-automation.service';
import { CrmCommercialController } from './crm-commercial.controller';
import { CrmCommunicationComplianceController } from './crm-communication-compliance.controller';
import { CrmCommunicationComplianceService } from './crm-communication-compliance.service';
import { CrmController } from './crm.controller';
import { CrmCustomer360Service } from './crm-customer360.service';
import { CrmInboundContactResolverService } from './crm-inbound-contact-resolver.service';
import { CrmMessageController } from './crm-message.controller';
import { CrmMessageProviderConnectionsController } from './crm-message-provider-connections.controller';
import { CrmMessageProviderConnectionsService } from './crm-message-provider-connections.service';
import { CrmMessageProviderRegistryService } from './crm-message-provider-registry.service';
import { CrmMessageProviderVaultService } from './crm-message-provider-vault.service';
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
import { MetaWhatsAppMessageProvider } from './meta-whatsapp-message.provider';

@Module({
  controllers: [
    CrmController,
    CrmOperationsController,
    CrmCommercialController,
    CrmCommunicationComplianceController,
    CrmAutomationRulesController,
    CrmMessageController,
    CrmMessageProviderConnectionsController,
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
    CrmCommunicationComplianceService,
    CrmAutomationRulesService,
    CrmAutomationService,
    CrmAutomationMessageActionService,
    CrmAutomationObservabilityService,
    CrmAutomationSchedulerService,
    CrmInboundContactResolverService,
    CrmMessageProviderRegistryService,
    CrmMessageProviderConnectionsService,
    CrmMessageProviderVaultService,
    MetaWhatsAppMessageProvider,
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
