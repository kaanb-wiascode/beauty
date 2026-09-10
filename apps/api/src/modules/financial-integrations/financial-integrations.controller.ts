import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { FinancialIntegrationsService } from './financial-integrations.service';
import { FinancialIntegrationConnectionService } from './financial-integration-connection.service';
import { FinancialIntegrationSyncService } from './financial-integration-sync.service';
import { FinancialIntegrationCredentialsService } from './financial-integration-credentials.service';
import { FinancialIntegrationHealthService } from './financial-integration-health.service';
import { ProviderRegistryService } from './provider-registry.service';
import { PosSettlementService } from './pos-settlement.service';
import { PosSettlementImportService } from './pos-settlement-import.service';
import { PosWebhookQueueService } from './pos-webhook-queue.service';
import { PosBankReconciliationService } from './pos-bank-reconciliation.service';
import { PosSalePaymentLinkageService } from './pos-sale-payment-linkage.service';
import { PosFinancialEventsService } from './pos-financial-events.service';
import { PosRefundService } from './pos-refund.service';

const createSchema = z.object({
  kind: z.enum(['OPEN_BANKING','VIRTUAL_POS']),
  provider: z.string().trim().min(2).max(80),
  displayName: z.string().trim().min(2).max(120),
  authType: z.enum(['OAUTH2','API_KEY','MANUAL']).optional(),
  branchId: z.string().uuid().optional(),
});
const txQuery = z.object({ limit: z.coerce.number().int().min(1).max(500).optional() });
const settlementForecastQuery = z.object({ days: z.coerce.number().int().min(1).max(90).optional() });
const credentialsSchema = z.object({
  credentials: z.record(z.string().min(1).max(80), z.string().min(1).max(4000)),
});
const settlementListSchema = z.object({ integrationId: z.string().uuid().optional() });
const settlementSchema = z.object({
  providerSettlementId: z.string().trim().min(1).max(160),
  bankAccountId: z.string().uuid().optional(),
  transactionIds: z.array(z.string().uuid()).min(1).max(1000),
  settledAt: z.coerce.date(),
});
const settlementImportSchema = z.object({ date: z.coerce.date() });
const reconciliationSuggestSchema = z.object({ days: z.coerce.number().int().min(1).max(14).optional() });
const reconciliationMatchSchema = z.object({
  bankTransactionId: z.string().uuid(),
  confidence: z.coerce.number().min(0).max(100).optional(),
  note: z.string().trim().max(500).optional(),
});
const autoMatchSchema = z.object({ limit: z.coerce.number().int().min(1).max(500).optional() });
const paymentLinkSchema = z.object({ salePaymentId: z.string().uuid() });
const webhookAuditQuerySchema = z.object({
  status: z.enum([
    'RECEIVED',
    'PROCESSING',
    'PROCESSED',
    'IGNORED',
    'FAILED',
    'RETRY_PENDING',
    'ENRICHMENT_PENDING',
    'DEAD_LETTER',
  ]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
const financialEventSchema = z.object({
  eventType: z.enum(['REFUND','CHARGEBACK']),
  externalEventId: z.string().trim().min(1).max(160),
  amount: z.coerce.number().positive(),
  feeAmount: z.coerce.number().min(0).optional(),
  occurredAt: z.coerce.date(),
});
const refundSchema = z.object({
  amount: z.coerce.number().positive(),
  externalEventId: z.string().trim().min(1).max(160),
});

@Controller('financial-integrations')
@UseGuards(JwtAuthGuard, TenantAuthGuard)
export class FinancialIntegrationsController {
  constructor(
    private readonly service: FinancialIntegrationsService,
    private readonly connection: FinancialIntegrationConnectionService,
    private readonly sync: FinancialIntegrationSyncService,
    private readonly credentials: FinancialIntegrationCredentialsService,
    private readonly health: FinancialIntegrationHealthService,
    private readonly providers: ProviderRegistryService,
    private readonly settlements: PosSettlementService,
    private readonly settlementImport: PosSettlementImportService,
    private readonly webhookQueue: PosWebhookQueueService,
    private readonly reconciliation: PosBankReconciliationService,
    private readonly paymentLinkage: PosSalePaymentLinkageService,
    private readonly financialEvents: PosFinancialEventsService,
    private readonly refunds: PosRefundService,
  ) {}

  @Post() create(@Body() body: unknown) { return this.service.create(createSchema.parse(body)); }
  @Get() list() { return this.service.list(); }
  @Get('providers') providerList() { return this.providers.list(); }
  @Get('bank-accounts') bankAccounts() { return this.service.accounts(); }
  @Get('bank-transactions') bankTransactions(@Query() query: unknown) { const q=txQuery.parse(query); return this.service.transactions(q.limit); }
  @Get('liquidity') liquidity() { return this.service.liquidity(); }
  @Get('treasury-position') treasuryPosition() { return this.service.treasuryPosition(); }
  @Get('pos/settlement-forecast') settlementForecast(@Query() query: unknown) {
    const parsed = settlementForecastQuery.parse(query);
    return this.service.settlementForecast(parsed.days);
  }
  @Get('pos/summary') posSummary() { return this.service.posSummary(); }
  @Get('pos/settlements') listSettlements(@Query() query: unknown) {
    const parsed = settlementListSchema.parse(query);
    return this.settlements.list(parsed.integrationId);
  }
  @Get('pos/webhooks') webhookAudit(@Query() query: unknown) {
    const parsed = webhookAuditQuerySchema.parse(query);
    return this.webhookQueue.list(parsed.status, parsed.limit);
  }
  @Post('pos/webhooks/:eventId/replay') replayWebhook(@Param('eventId') eventId: string) {
    return this.webhookQueue.requestReplay(eventId);
  }
  @Get('pos/reconciliation/summary') reconciliationSummary() { return this.reconciliation.summary(); }
  @Post('pos/reconciliation/auto-match') autoMatch(@Body() body: unknown) {
    const parsed = autoMatchSchema.parse(body ?? {});
    return this.reconciliation.autoMatch(parsed.limit);
  }
  @Post('pos/payment-links/auto') autoLinkPayments(@Body() body: unknown) {
    const parsed = autoMatchSchema.parse(body ?? {});
    return this.paymentLinkage.autoLink(parsed.limit);
  }
  @Post('pos/transactions/:posTransactionId/link-payment') linkPayment(
    @Param('posTransactionId') posTransactionId: string,
    @Body() body: unknown,
  ) {
    const parsed = paymentLinkSchema.parse(body);
    return this.paymentLinkage.link(posTransactionId, parsed.salePaymentId);
  }
  @Post('pos/transactions/:posTransactionId/refund') refundPosTransaction(
    @Param('posTransactionId') posTransactionId: string,
    @Body() body: unknown,
  ) {
    return this.refunds.refund(posTransactionId, refundSchema.parse(body));
  }
  @Post('pos/transactions/:posTransactionId/financial-events') recordFinancialEvent(
    @Param('posTransactionId') posTransactionId: string,
    @Body() body: unknown,
  ) {
    return this.financialEvents.record(posTransactionId, financialEventSchema.parse(body));
  }
  @Post('bank-transactions/:bankTransactionId/ignore') ignoreBankTransaction(
    @Param('bankTransactionId') bankTransactionId: string,
  ) {
    return this.reconciliation.ignoreBankTransaction(bankTransactionId);
  }
  @Get('pos/settlements/:settlementId/reconciliation-suggestions') reconciliationSuggestions(
    @Param('settlementId') settlementId: string,
    @Query() query: unknown,
  ) {
    const parsed = reconciliationSuggestSchema.parse(query);
    return this.reconciliation.suggest(settlementId, parsed.days);
  }
  @Post('pos/settlements/:settlementId/match-bank-transaction') matchBankTransaction(
    @Param('settlementId') settlementId: string,
    @Body() body: unknown,
  ) {
    const parsed = reconciliationMatchSchema.parse(body);
    return this.reconciliation.match(
      settlementId,
      parsed.bankTransactionId,
      parsed.confidence,
      parsed.note,
    );
  }
  @Get(':id/health') integrationHealth(@Param('id') id: string) { return this.health.get(id); }
  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
  @Get(':id/credentials') credentialStatus(@Param('id') id: string) { return this.credentials.status(id); }
  @Post(':id/credentials') configureCredentials(@Param('id') id: string, @Body() body: unknown) {
    const parsed = credentialsSchema.parse(body);
    return this.credentials.configure(id, parsed.credentials);
  }
  @Delete(':id/credentials') clearCredentials(@Param('id') id: string) { return this.credentials.clear(id); }
  @Post(':id/connect') connect(@Param('id') id: string) { return this.connection.begin(id); }
  @Post(':id/sync') syncIntegration(@Param('id') id: string) { return this.sync.syncIntegration(id); }
  @Post(':id/pos/settlements') recordSettlement(@Param('id') id: string, @Body() body: unknown) {
    const parsed = settlementSchema.parse(body);
    return this.settlements.record(id, parsed);
  }
  @Post(':id/pos/settlements/import') importSettlements(@Param('id') id: string, @Body() body: unknown) {
    const parsed = settlementImportSchema.parse(body);
    return this.settlementImport.import(id, parsed.date);
  }
  @Post(':id/disconnect') disconnect(@Param('id') id: string) { return this.connection.disconnect(id); }
}
