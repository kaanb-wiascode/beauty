import { Module } from '@nestjs/common';
import { FinancialIntegrationsController } from './financial-integrations.controller';
import { FinancialIntegrationCallbackController } from './financial-integration-callback.controller';
import { PosWebhookController } from './pos-webhook.controller';
import { FinancialIntegrationsService } from './financial-integrations.service';
import { ProviderRegistryService } from './provider-registry.service';
import { IntegrationSecretVaultService } from './integration-secret-vault.service';
import { FinancialIntegrationConnectionService } from './financial-integration-connection.service';
import { FinancialIntegrationSyncService } from './financial-integration-sync.service';
import { FinancialIntegrationSyncSchedulerService } from './financial-integration-sync-scheduler.service';
import { FinancialIntegrationCredentialsService } from './financial-integration-credentials.service';
import { PosSettlementService } from './pos-settlement.service';
import { PosWebhookService } from './pos-webhook.service';
import { PosWebhookQueueService } from './pos-webhook-queue.service';
import { PosWebhookQueueSchedulerService } from './pos-webhook-queue-scheduler.service';
import { PosBankReconciliationService } from './pos-bank-reconciliation.service';
import { PosSalePaymentLinkageService } from './pos-sale-payment-linkage.service';
import { PosFinancialEventsService } from './pos-financial-events.service';
import { PosRefundService } from './pos-refund.service';
import { PosReconciliationSchedulerService } from './pos-reconciliation-scheduler.service';
import { IyzicoAdapter } from './providers/iyzico.adapter';
import { PaytrAdapter } from './providers/paytr.adapter';

@Module({
  controllers: [
    FinancialIntegrationsController,
    FinancialIntegrationCallbackController,
    PosWebhookController,
  ],
  providers: [
    FinancialIntegrationsService,
    IyzicoAdapter,
    PaytrAdapter,
    ProviderRegistryService,
    IntegrationSecretVaultService,
    FinancialIntegrationConnectionService,
    FinancialIntegrationSyncService,
    FinancialIntegrationSyncSchedulerService,
    FinancialIntegrationCredentialsService,
    PosSettlementService,
    PosWebhookService,
    PosWebhookQueueService,
    PosWebhookQueueSchedulerService,
    PosBankReconciliationService,
    PosSalePaymentLinkageService,
    PosFinancialEventsService,
    PosRefundService,
    PosReconciliationSchedulerService,
  ],
  exports: [
    FinancialIntegrationsService,
    ProviderRegistryService,
    IntegrationSecretVaultService,
    FinancialIntegrationConnectionService,
    FinancialIntegrationSyncService,
    FinancialIntegrationCredentialsService,
    PosSettlementService,
    PosWebhookService,
    PosWebhookQueueService,
    PosBankReconciliationService,
    PosSalePaymentLinkageService,
    PosFinancialEventsService,
    PosRefundService,
  ],
})
export class FinancialIntegrationsModule {}
