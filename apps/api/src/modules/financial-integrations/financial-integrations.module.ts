import { Module } from '@nestjs/common';
import { FinancialIntegrationsController } from './financial-integrations.controller';
import { FinancialIntegrationCallbackController } from './financial-integration-callback.controller';
import { FinancialIntegrationOperationsController } from './financial-integration-operations.controller';
import { PosWebhookController } from './pos-webhook.controller';
import { FinancialIntegrationsService } from './financial-integrations.service';
import { ProviderRegistryService } from './provider-registry.service';
import { ProviderResilienceService } from './provider-resilience.service';
import { IntegrationSecretVaultService } from './integration-secret-vault.service';
import { FinancialIntegrationConnectionService } from './financial-integration-connection.service';
import { FinancialIntegrationSyncService } from './financial-integration-sync.service';
import { FinancialIntegrationSyncSchedulerService } from './financial-integration-sync-scheduler.service';
import { FinancialIntegrationCredentialsService } from './financial-integration-credentials.service';
import { FinancialIntegrationHealthService } from './financial-integration-health.service';
import { FinancialIntegrationAlertsService } from './financial-integration-alerts.service';
import { FinancialIntegrationPermissionGuard } from './financial-integration-permission.guard';
import { FinancialIntegrationAuditInterceptor } from './financial-integration-audit.interceptor';
import { FinancialIntegrationAuditService } from './financial-integration-audit.service';
import { FinancialIntegrationRateLimitGuard } from './financial-integration-rate-limit.guard';
import { PublicFinancialRateLimitGuard } from './public-financial-rate-limit.guard';
import { FinancialIntegrationTelemetryService } from './financial-integration-telemetry.service';
import { PosSettlementService } from './pos-settlement.service';
import { PosSettlementImportService } from './pos-settlement-import.service';
import { PosWebhookService } from './pos-webhook.service';
import { PosWebhookQueueService } from './pos-webhook-queue.service';
import { PosWebhookQueueSchedulerService } from './pos-webhook-queue-scheduler.service';
import { PosBankReconciliationService } from './pos-bank-reconciliation.service';
import { PosSalePaymentLinkageService } from './pos-sale-payment-linkage.service';
import { PosFinancialEventsService } from './pos-financial-events.service';
import { PosRefundService } from './pos-refund.service';
import { PosReconciliationSchedulerService } from './pos-reconciliation-scheduler.service';
import { GarantiBbvaAdapter } from './providers/garanti-bbva.adapter';
import { IyzicoAdapter } from './providers/iyzico.adapter';
import { PaytrAdapter } from './providers/paytr.adapter';

@Module({
  controllers: [
    FinancialIntegrationsController,
    FinancialIntegrationCallbackController,
    FinancialIntegrationOperationsController,
    PosWebhookController,
  ],
  providers: [
    FinancialIntegrationsService,
    GarantiBbvaAdapter,
    IyzicoAdapter,
    PaytrAdapter,
    ProviderRegistryService,
    ProviderResilienceService,
    IntegrationSecretVaultService,
    FinancialIntegrationConnectionService,
    FinancialIntegrationSyncService,
    FinancialIntegrationSyncSchedulerService,
    FinancialIntegrationCredentialsService,
    FinancialIntegrationHealthService,
    FinancialIntegrationAlertsService,
    FinancialIntegrationPermissionGuard,
    FinancialIntegrationAuditInterceptor,
    FinancialIntegrationAuditService,
    FinancialIntegrationRateLimitGuard,
    PublicFinancialRateLimitGuard,
    FinancialIntegrationTelemetryService,
    PosSettlementService,
    PosSettlementImportService,
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
    ProviderResilienceService,
    IntegrationSecretVaultService,
    FinancialIntegrationConnectionService,
    FinancialIntegrationSyncService,
    FinancialIntegrationCredentialsService,
    FinancialIntegrationHealthService,
    FinancialIntegrationAlertsService,
    FinancialIntegrationAuditService,
    FinancialIntegrationTelemetryService,
    PosSettlementService,
    PosSettlementImportService,
    PosWebhookService,
    PosWebhookQueueService,
    PosBankReconciliationService,
    PosSalePaymentLinkageService,
    PosFinancialEventsService,
    PosRefundService,
  ],
})
export class FinancialIntegrationsModule {}
