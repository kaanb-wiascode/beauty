import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { FinancialIntegrationsService } from './financial-integrations.service';

const createSchema = z.object({
  kind: z.enum(['OPEN_BANKING','VIRTUAL_POS']),
  provider: z.string().trim().min(2).max(80),
  displayName: z.string().trim().min(2).max(120),
  authType: z.enum(['OAUTH2','API_KEY','MANUAL']).optional(),
  branchId: z.string().uuid().optional(),
});
const beginSchema = z.object({ callbackBaseUrl: z.string().url() });
const txQuery = z.object({ limit: z.coerce.number().int().min(1).max(500).optional() });

@Controller('financial-integrations')
@UseGuards(JwtAuthGuard, TenantAuthGuard)
export class FinancialIntegrationsController {
  constructor(private readonly service: FinancialIntegrationsService) {}

  @Post() create(@Body() body: unknown) { return this.service.create(createSchema.parse(body)); }
  @Get() list() { return this.service.list(); }
  @Get('bank-accounts') bankAccounts() { return this.service.accounts(); }
  @Get('bank-transactions') bankTransactions(@Query() query: unknown) { const q=txQuery.parse(query); return this.service.transactions(q.limit); }
  @Get('liquidity') liquidity() { return this.service.liquidity(); }
  @Get('pos/summary') posSummary() { return this.service.posSummary(); }
  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
  @Post(':id/connect') connect(@Param('id') id: string, @Body() body: unknown) { const b=beginSchema.parse(body); return this.service.beginConnection(id,b.callbackBaseUrl); }
  @Post(':id/disconnect') disconnect(@Param('id') id: string) { return this.service.disconnect(id); }
}
