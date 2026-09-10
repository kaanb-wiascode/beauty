import { Module } from '@nestjs/common';
import { FinancialIntegrationsController } from './financial-integrations.controller';
import { FinancialIntegrationCallbackController } from './financial-integration-callback.controller';
import { FinancialIntegrationsService } from './financial-integrations.service';
import { ProviderRegistryService } from './provider-registry.service';
import { IntegrationSecretVaultService } from './integration-secret-vault.service';
import { FinancialIntegrationConnectionService } from './financial-integration-connection.service';
import { FinancialIntegrationSyncService } from './financial-integration-sync.service';
import { FinancialIntegrationSyncSchedulerService } from './financial-integration-sync-scheduler.service';
import { FinancialIntegrationCredentialsService } from './financial-integration-credentials.service';

@Module({
  controllers: [FinancialIntegrationsController, FinancialIntegrationCallbackController],
  providers: [
    FinancialIntegrationsService,
    ProviderRegistryService,
    IntegrationSecretVaultService,
    FinancialIntegrationConnectionService,
    FinancialIntegrationSyncService,
    FinancialIntegrationSyncSchedulerService,
    FinancialIntegrationCredentialsService,
  ],
  exports: [
    FinancialIntegrationsService,
    ProviderRegistryService,
    IntegrationSecretVaultService,
    FinancialIntegrationConnectionService,
    FinancialIntegrationSyncService,
    FinancialIntegrationCredentialsService,
  ],
})
export class FinancialIntegrationsModule {}
