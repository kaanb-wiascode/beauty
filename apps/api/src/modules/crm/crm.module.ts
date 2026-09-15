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
import { CrmConversationAnalyticsController } from './crm-conversation-analytics.controller';
import { CrmConversationAnalyticsService } from './crm-conversation-analytics.service';
import { CrmConversationController } from './crm-conversation.controller';
import { CrmConversationOperationsController } from './crm-conversation-operations.controller';
import { CrmConversationOperationsService } from './crm-conversation-operations.service';
import { CrmConversationService } from './crm-conversation.service';
import { CrmController } from './crm.controller';
import { CrmCustomer360Service } from './crm-customer360.service';
import { CrmInboundContactResolverService } from './crm-inbound-contact-resolver.service';
import { CrmInboundOptOutService } from './crm-inbound-opt-out.service';
import { CrmLeadService } from './crm-lead.service';
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
import { CrmReportingService } from './crm-reporting.service';
import { CrmService } from './crm.service';
import { CrmUnresolvedInboundController } from './crm-unresolved-inbound.controller';
import { CrmUnresolvedInboundService } from './crm-unresolved-inbound.service';
import { MetaWhatsAppMessageProvider } from './meta-whatsapp-message.provider';
import { ResendEmailConnectionController } from './resend-email-connection.controller';
import { ResendEmailMessageProvider } from './resend-email-message.provider';
import { TwilioSmsConnectionController } from './twilio-sms-connection.controller';
import { TwilioSmsMessageProvider } from './twilio-sms-message.provider';

@Module({
  controllers: [
    CrmController,
    CrmOperationsController,
    CrmCommercialController,
    CrmCommunicationComplianceController,
    CrmConversationController,
    CrmConversationAnalyticsController,
    CrmConversationOperationsController,
    CrmAutomationRulesController,
    CrmMessageController,
    CrmMessageProviderConnectionsController,
    TwilioSmsConnectionController,
    ResendEmailConnectionController,
    CrmMessageWebhookController,
    CrmMessageWebhookHistoryController,
    CrmUnresolvedInboundController,
  ],
  providers: [
    CrmService,
    CrmLeadService,
    CrmOpportunityService,
    CrmOperationsService,
    CrmOpportunityCommercialService,
    CrmCustomer360Service,
    CrmReminderService,
    CrmReportingService,
    CrmCommunicationComplianceService,
    CrmConversationService,
    CrmConversationAnalyticsService,
    CrmConversationOperationsService,
    CrmAutomationRulesService,
    CrmAutomationService,
    CrmAutomationMessageActionService,
    CrmAutomationObservabilityService,
    CrmAutomationSchedulerService,
    CrmInboundContactResolverService,
    CrmInboundOptOutService,
    CrmMessageProviderRegistryService,
    CrmMessageProviderConnectionsService,
    CrmMessageProviderVaultService,
    MetaWhatsAppMessageProvider,
    TwilioSmsMessageProvider,
    ResendEmailMessageProvider,
    CrmMessageService,
    CrmMessageWebhookService,
    CrmMessageWebhookHistoryService,
    CrmUnresolvedInboundService,
  ],
  exports: [
    CrmService,
    CrmLeadService,
    CrmOpportunityService,
    CrmOperationsService,
    CrmReportingService,
    CrmMessageService,
    CrmMessageProviderRegistryService,
  ],
})
export class CrmModule {}
