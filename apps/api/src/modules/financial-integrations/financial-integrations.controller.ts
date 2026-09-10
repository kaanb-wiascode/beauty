import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { FinancialIntegrationsService } from './financial-integrations.service';
import { FinancialIntegrationConnectionService } from './financial-integration-connection.service';
import { FinancialIntegrationSyncService } from './financial-integration-sync.service';
import { FinancialIntegrationCredentialsService } from './financial-integration-credentials.service';
import { ProviderRegistryService } from './provider-registry.service';
import { PosSettlementService } from './pos-settlement.service';

const createSchema = z.object({
  kind: z.enum(['OPEN_BANKING','VIRTUAL_POS']),
  provider: z.string().trim().min(2).max(80),
  displayName: z.string().trim().min(2).max(120),
  authType: z.enum(['OAUTH2','API_KEY','MANUAL']).optional(),
  branchId: z.string().uuid().optional(),
});
const beginSchema = z.object({ callbackBaseUrl: z.string().url() });
const txQuery = z.object({ limit: z.coerce.number().int().min(1).max(500).optional() });
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

@Controller('financial-integrations')
@UseGuards(JwtAuthGuard, TenantAuthGuard)
export class FinancialIntegrationsController {
  constructor(
    private readonly service: FinancialIntegrationsService,
    private readonly connection: FinancialIntegrationConnectionService,
    private readonly sync: FinancialIntegrationSyncService,
    private readonly credentials: FinancialIntegrationCredentialsService,
    private readonly providers: ProviderRegistryService,
    private readonly settlements: PosSettlementService,
  ) {}

  @Post() create(@Body() body: unknown) { return this.service.create(createSchema.parse(body)); }
  @Get() list() { return this.service.list(); }
  @Get('providers') providerList() { return this.providers.list(); }
  @Get('bank-accounts') bankAccounts() { return this.service.accounts(); }
  @Get('bank-transactions') bankTransactions(@Query() query: unknown) { const q=txQuery.parse(query); return this.service.transactions(q.limit); }
  @Get('liquidity') liquidity() { return this.service.liquidity(); }
  @Get('pos/summary') posSummary() { return this.service.posSummary(); }
  @Get('pos/settlements') listSettlements(@Query() query: unknown) {
    const parsed = settlementListSchema.parse(query);
    return this.settlements.list(parsed.integrationId);
  }
  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
  @Get(':id/credentials') credentialStatus(@Param('id') id: string) { return this.credentials.status(id); }
  @Post(':id/credentials') configureCredentials(@Param('id') id: string, @Body() body: unknown) {
    const parsed = credentialsSchema.parse(body);
    return this.credentials.configure(id, parsed.credentials);
  }
  @Delete(':id/credentials') clearCredentials(@Param('id') id: string) { return this.credentials.clear(id); }
  @Post(':id/connect') connect(@Param('id') id: string, @Body() body: unknown) { const b=beginSchema.parse(body); return this.connection.begin(id,b.callbackBaseUrl); }
  @Post(':id/sync') syncIntegration(@Param('id') id: string) { return this.sync.syncIntegration(id); }
  @Post(':id/pos/settlements') recordSettlement(@Param('id') id: string, @Body() body: unknown) {
    const parsed = settlementSchema.parse(body);
    return this.settlements.record(id, parsed);
  }
  @Post(':id/disconnect') disconnect(@Param('id') id: string) { return this.connection.disconnect(id); }
}
