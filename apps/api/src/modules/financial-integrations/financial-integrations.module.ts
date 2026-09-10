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
import { PosBankReconciliationService } from './pos-bank-reconciliation.service';
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
    PosBankReconciliationService,
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
    PosBankReconciliationService,
  ],
})
export class FinancialIntegrationsModule {}
