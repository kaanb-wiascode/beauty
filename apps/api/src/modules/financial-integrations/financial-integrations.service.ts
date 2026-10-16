import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type Kind = 'OPEN_BANKING' | 'VIRTUAL_POS';
type AuthType = 'OAUTH2' | 'API_KEY' | 'MANUAL';

interface CreateIntegrationInput {
  kind: Kind;
  provider: string;
  displayName: string;
  authType?: AuthType;
  branchId?: string;
}

@Injectable()
export class FinancialIntegrationsService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}

  private context() {
    return { tenantId: this.tenant.getTenantId(), companyId: this.tenant.getCompanyId(), branchId: this.tenant.getBranchId() };
  }

  async create(input: CreateIntegrationInput) {
    const ctx = this.context();
    const branchId = input.branchId ?? ctx.branchId;
    if (ctx.branchId && branchId !== ctx.branchId) throw new BadRequestException('Integration must belong to the active branch.');
    if (branchId) {
      const branch = await this.prisma.$queryRawUnsafe<any[]>(`SELECT id FROM branches WHERE id=$1::text AND "companyId"=$2::text LIMIT 1`, branchId, ctx.companyId);
      if (!branch.length) throw new BadRequestException('Branch does not belong to the active company.');
    }
    const id = randomUUID();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO finance_integrations(id,tenant_id,company_id,branch_id,kind,provider,display_name,auth_type)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,kind,provider,display_name AS "displayName",status,auth_type AS "authType",branch_id AS "branchId",created_at AS "createdAt"`,
      id, ctx.tenantId, ctx.companyId, branchId, input.kind, input.provider.trim().toUpperCase(), input.displayName.trim(), input.authType ?? 'OAUTH2');
    return rows[0];
  }

  async list() {
    const ctx = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,kind,provider,display_name AS "displayName",status,auth_type AS "authType",branch_id AS "branchId",consent_expires_at AS "consentExpiresAt",last_sync_at AS "lastSyncAt",last_error AS "lastError",created_at AS "createdAt"
       FROM finance_integrations WHERE tenant_id=$1 AND company_id=$2 AND ($3::text IS NULL OR branch_id=$3) ORDER BY created_at DESC`, ctx.tenantId, ctx.companyId, ctx.branchId);
  }

  async get(id: string) {
    const ctx = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,kind,provider,display_name AS "displayName",status,auth_type AS "authType",branch_id AS "branchId",external_connection_id AS "externalConnectionId",consent_expires_at AS "consentExpiresAt",last_sync_at AS "lastSyncAt",last_error AS "lastError",metadata,created_at AS "createdAt"
       FROM finance_integrations WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND ($4::text IS NULL OR branch_id=$4) LIMIT 1`, id, ctx.tenantId, ctx.companyId, ctx.branchId);
    if (!rows.length) throw new NotFoundException('Financial integration not found.');
    return rows[0];
  }

  async beginConnection(id: string, callbackBaseUrl: string) {
    const integration = await this.get(id);
    const state = randomUUID();
    await this.prisma.$executeRawUnsafe(`UPDATE finance_integrations SET metadata=metadata || jsonb_build_object('oauthState',$2::text),updated_at=NOW() WHERE id=$1`, id, state);
    return {
      integrationId: id,
      provider: integration.provider,
      status: integration.status,
      state,
      callbackUrl: `${callbackBaseUrl.replace(/\/$/, '')}/financial-integrations/${id}/callback`,
      mode: integration.authType,
      message: integration.authType === 'OAUTH2'
        ? 'Provider adapter must exchange this state through the licensed bank/open-banking provider authorization flow.'
        : 'Provider credentials must be submitted through the secure credential endpoint; secrets are never returned by this API.',
    };
  }

  async disconnect(id: string) {
    await this.get(id);
    await this.prisma.$executeRawUnsafe(`UPDATE finance_integrations SET status='DISCONNECTED',external_connection_id=NULL,consent_expires_at=NULL,updated_at=NOW() WHERE id=$1`, id);
    return this.get(id);
  }

  async accounts() {
    const ctx = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT a.id,a.integration_id AS "integrationId",a.bank_name AS "bankName",a.account_name AS "accountName",a.iban_masked AS "ibanMasked",a.currency,a.available_balance AS "availableBalance",a.current_balance AS "currentBalance",a.balance_as_of AS "balanceAsOf",a.active
       FROM bank_accounts a WHERE a.tenant_id=$1 AND a.company_id=$2 AND ($3::text IS NULL OR a.branch_id=$3) ORDER BY a.bank_name,a.account_name`, ctx.tenantId, ctx.companyId, ctx.branchId);
  }

  async liquidity() {
    const accounts = await this.accounts();
    const byCurrency: Record<string, { current: number; available: number }> = {};
    for (const a of accounts) {
      const c = a.currency || 'TRY';
      byCurrency[c] ??= { current: 0, available: 0 };
      byCurrency[c].current += Number(a.currentBalance ?? 0);
      byCurrency[c].available += Number(a.availableBalance ?? a.currentBalance ?? 0);
    }
    return { accountCount: accounts.length, byCurrency, accounts };
  }

  async transactions(limit = 100) {
    const ctx = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT t.id,t.bank_account_id AS "bankAccountId",a.bank_name AS "bankName",t.booked_at AS "bookedAt",t.value_at AS "valueAt",t.amount,t.currency,t.description,t.counterparty_name AS "counterpartyName",t.counterparty_iban_masked AS "counterpartyIbanMasked",t.reconciliation_status AS "reconciliationStatus"
       FROM bank_transactions t JOIN bank_accounts a ON a.id=t.bank_account_id
       WHERE t.tenant_id=$1 AND t.company_id=$2 AND ($3::text IS NULL OR t.branch_id=$3) ORDER BY t.booked_at DESC LIMIT $4`, ctx.tenantId, ctx.companyId, ctx.branchId, Math.min(Math.max(limit, 1), 500));
  }

  async posSummary() {
    const ctx = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT currency,COALESCE(SUM(net_amount) FILTER (WHERE status='CAPTURED' AND settled_at IS NULL),0)::numeric AS "nearCash",COALESCE(SUM(net_amount) FILTER (WHERE settled_at IS NOT NULL),0)::numeric AS settled,COUNT(*)::int AS "transactionCount"
       FROM pos_transactions WHERE tenant_id=$1 AND company_id=$2 AND ($3::text IS NULL OR branch_id=$3) GROUP BY currency`, ctx.tenantId, ctx.companyId, ctx.branchId);
    return { currencies: rows };
  }

  async treasuryPosition() {
    const [liquidity, pos] = await Promise.all([this.liquidity(), this.posSummary()]);
    const currencies = new Set<string>([
      ...Object.keys(liquidity.byCurrency),
      ...pos.currencies.map((row: any) => String(row.currency || 'TRY')),
    ]);
    const byCurrency: Record<string, { cash: number; nearCash: number; totalLiquidity: number; currentBankBalance: number; settledPos: number }> = {};
    for (const currency of currencies) {
      const bank = liquidity.byCurrency[currency] ?? { current: 0, available: 0 };
      const posRow = pos.currencies.find((row: any) => row.currency === currency);
      const cash = Number(bank.available ?? 0);
      const nearCash = Number(posRow?.nearCash ?? 0);
      byCurrency[currency] = {
        cash,
        nearCash,
        totalLiquidity: cash + nearCash,
        currentBankBalance: Number(bank.current ?? 0),
        settledPos: Number(posRow?.settled ?? 0),
      };
    }
    return { accountCount: liquidity.accountCount, byCurrency };
  }

  async settlementForecast(days = 14) {
    const ctx = this.context();
    const horizon = Math.min(Math.max(days, 1), 90);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT
         DATE(COALESCE(expected_settlement_at, NOW())) AS date,
         currency,
         COUNT(*)::int AS "transactionCount",
         COALESCE(SUM(amount),0)::numeric AS "grossAmount",
         COALESCE(SUM(fee_amount),0)::numeric AS "feeAmount",
         COALESCE(SUM(net_amount),0)::numeric AS "netAmount"
       FROM pos_transactions
       WHERE tenant_id=$1 AND company_id=$2
         AND ($3::text IS NULL OR branch_id=$3)
         AND status='CAPTURED'
         AND settled_at IS NULL
         AND COALESCE(expected_settlement_at, NOW()) < NOW() + ($4::text || ' days')::interval
       GROUP BY DATE(COALESCE(expected_settlement_at, NOW())), currency
       ORDER BY date ASC, currency ASC`,
      ctx.tenantId,
      ctx.companyId,
      ctx.branchId,
      horizon,
    );
    const totals = rows.reduce((acc: Record<string, { grossAmount: number; feeAmount: number; netAmount: number; transactionCount: number }>, row: any) => {
      const currency = String(row.currency || 'TRY');
      acc[currency] ??= { grossAmount: 0, feeAmount: 0, netAmount: 0, transactionCount: 0 };
      acc[currency].grossAmount += Number(row.grossAmount ?? 0);
      acc[currency].feeAmount += Number(row.feeAmount ?? 0);
      acc[currency].netAmount += Number(row.netAmount ?? 0);
      acc[currency].transactionCount += Number(row.transactionCount ?? 0);
      return acc;
    }, {});
    return { horizonDays: horizon, totals, days: rows };
  }
}