import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { IntegrationSecretVaultService } from './integration-secret-vault.service';
import { ProviderRegistryService } from './provider-registry.service';
import { PosBankReconciliationService } from './pos-bank-reconciliation.service';
import { PosSalePaymentLinkageService } from './pos-sale-payment-linkage.service';
import type {
  FinancialProviderAdapter,
  ProviderBankAccount,
  ProviderBankTransaction,
  ProviderTokenSet,
} from './provider-adapter';

interface IntegrationScope {
  tenantId: string;
  companyId: string;
  branchId: string | null;
}

interface OpenBankingPages {
  accounts: ProviderBankAccount[];
  transactions: ProviderBankTransaction[];
  nextSyncCursor?: string;
}

@Injectable()
export class FinancialIntegrationSyncService {
  private static readonly MAX_PROVIDER_PAGES = 100;

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProviderRegistryService,
    private readonly vault: IntegrationSecretVaultService,
    private readonly tenant: TenantContext,
    private readonly paymentLinkage: PosSalePaymentLinkageService,
    private readonly reconciliation: PosBankReconciliationService,
  ) {}

  private context(): IntegrationScope {
    return {
      tenantId: this.tenant.getTenantId(),
      companyId: this.tenant.getCompanyId(),
      branchId: this.tenant.getBranchId(),
    };
  }

  private async ensureFreshTokens(
    integrationId: string,
    adapter: FinancialProviderAdapter,
    tokens: ProviderTokenSet,
  ): Promise<ProviderTokenSet> {
    const now = Date.now();
    if (tokens.consentExpiresAt && tokens.consentExpiresAt.getTime() <= now) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE finance_integrations
         SET status='ERROR',last_error='OPEN_BANKING_CONSENT_EXPIRED',updated_at=NOW()
         WHERE id=$1::text`,
        integrationId,
      );
      throw new BadRequestException('Open Banking consent has expired and must be renewed.');
    }

    const expiresSoon = tokens.expiresAt && tokens.expiresAt.getTime() <= now + 2 * 60 * 1000;
    if (!expiresSoon) return tokens;
    if (!tokens.refreshToken || !adapter.refreshTokens) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE finance_integrations
         SET status='ERROR',last_error='OPEN_BANKING_TOKEN_REFRESH_REQUIRED',updated_at=NOW()
         WHERE id=$1::text`,
        integrationId,
      );
      throw new BadRequestException('Open Banking access token has expired and cannot be refreshed automatically.');
    }

    const refreshed = await adapter.refreshTokens(tokens);
    if (!refreshed.accessToken) {
      throw new BadRequestException('Open Banking provider returned an invalid refreshed token set.');
    }
    const merged: ProviderTokenSet = {
      ...tokens,
      ...refreshed,
      refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
      externalConnectionId: refreshed.externalConnectionId ?? tokens.externalConnectionId,
      consentExpiresAt: refreshed.consentExpiresAt ?? tokens.consentExpiresAt,
      metadata: { ...(tokens.metadata ?? {}), ...(refreshed.metadata ?? {}) },
    };
    await this.vault.store(integrationId, merged);
    await this.prisma.$executeRawUnsafe(
      `UPDATE finance_integrations
       SET external_connection_id=COALESCE($2,external_connection_id),
           consent_expires_at=COALESCE($3,consent_expires_at),last_error=NULL,updated_at=NOW()
       WHERE id=$1::text`,
      integrationId,
      merged.externalConnectionId ?? null,
      merged.consentExpiresAt ?? null,
    );
    return merged;
  }

  private async resolveTokens(
    integration: any,
    adapter: FinancialProviderAdapter,
  ): Promise<ProviderTokenSet> {
    if (integration.kind === 'OPEN_BANKING' && integration.authType === 'API_KEY') {
      if (!adapter.authenticateCredentials) {
        throw new BadRequestException('Open Banking provider does not support credential-token authentication.');
      }
      const credentials = await this.vault.loadOpaque(integration.id);
      if (!credentials) throw new BadRequestException('Integration credentials are missing.');
      const tokens = await adapter.authenticateCredentials(credentials);
      if (!tokens.accessToken) {
        throw new BadRequestException('Open Banking provider returned an invalid authentication response.');
      }
      return tokens;
    }

    const storedTokens = await this.vault.load(integration.id);
    if (!storedTokens) throw new BadRequestException('Integration credentials are missing.');
    return integration.kind === 'OPEN_BANKING'
      ? this.ensureFreshTokens(integration.id, adapter, storedTokens)
      : storedTokens;
  }

  private metadataSyncCursor(metadata: unknown) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
    const value = (metadata as Record<string, unknown>).bankTransactionSyncCursor;
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private async collectOpenBankingPages(
    adapter: FinancialProviderAdapter,
    tokens: ProviderTokenSet,
    since: Date | undefined,
    syncCursor: string | undefined,
  ): Promise<OpenBankingPages> {
    const accounts: ProviderBankAccount[] = [];
    const transactions: ProviderBankTransaction[] = [];

    if (adapter.listBankAccountPage) {
      let pageCursor: string | undefined;
      const seenCursors = new Set<string>();
      for (let page = 0; page < FinancialIntegrationSyncService.MAX_PROVIDER_PAGES; page += 1) {
        const result = await adapter.listBankAccountPage(tokens, { pageCursor });
        accounts.push(...result.items);
        if (!result.nextPageCursor) break;
        if (seenCursors.has(result.nextPageCursor)) {
          throw new BadRequestException('Open Banking provider returned a repeating account page cursor.');
        }
        seenCursors.add(result.nextPageCursor);
        pageCursor = result.nextPageCursor;
        if (page === FinancialIntegrationSyncService.MAX_PROVIDER_PAGES - 1) {
          throw new BadRequestException('Open Banking account pagination exceeded the safety limit.');
        }
      }
    } else if (adapter.listBankAccounts) {
      accounts.push(...await adapter.listBankAccounts(tokens));
    } else {
      throw new BadRequestException('Provider does not support bank account synchronization.');
    }

    let nextSyncCursor: string | undefined;
    if (adapter.listBankTransactionPage) {
      let pageCursor: string | undefined;
      const seenCursors = new Set<string>();
      for (let page = 0; page < FinancialIntegrationSyncService.MAX_PROVIDER_PAGES; page += 1) {
        const result = await adapter.listBankTransactionPage(tokens, { since, pageCursor, syncCursor });
        transactions.push(...result.items);
        nextSyncCursor = result.nextSyncCursor ?? nextSyncCursor;
        if (!result.nextPageCursor) break;
        if (seenCursors.has(result.nextPageCursor)) {
          throw new BadRequestException('Open Banking provider returned a repeating transaction page cursor.');
        }
        seenCursors.add(result.nextPageCursor);
        pageCursor = result.nextPageCursor;
        if (page === FinancialIntegrationSyncService.MAX_PROVIDER_PAGES - 1) {
          throw new BadRequestException('Open Banking transaction pagination exceeded the safety limit.');
        }
      }
    } else if (adapter.listBankTransactions) {
      transactions.push(...await adapter.listBankTransactions(tokens, since));
    }

    return { accounts, transactions, nextSyncCursor };
  }

  async syncIntegration(integrationId: string) {
    return this.syncIntegrationInternal(integrationId, this.context());
  }

  private async syncIntegrationInternal(integrationId: string, scope?: IntegrationScope) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,tenant_id AS "tenantId",company_id AS "companyId",branch_id AS "branchId",
              kind,provider,status,auth_type AS "authType",last_sync_at AS "lastSyncAt",metadata
       FROM finance_integrations
       WHERE id=$1::text
         AND ($2::text IS NULL OR tenant_id=$2::text)
         AND ($3::text IS NULL OR company_id=$3::text)
         AND ($4::text IS NULL OR branch_id=$4::text)
       LIMIT 1`,
      integrationId,
      scope?.tenantId ?? null,
      scope?.companyId ?? null,
      scope?.branchId ?? null,
    );
    if (!rows.length) throw new NotFoundException('Financial integration not found.');
    const integration = rows[0];
    if (integration.status !== 'CONNECTED') {
      throw new BadRequestException('Only connected integrations can be synchronized.');
    }
    const adapter = this.providers.get(integration.kind, integration.provider);
    const tokens = await this.resolveTokens(integration, adapter);

    const runId = randomUUID();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO finance_integration_sync_runs(id,integration_id,sync_type,status)
       VALUES($1::text,$2::text,'FULL','RUNNING')`,
      runId,
      integrationId,
    );

    let records = 0;
    let linkedPayments = 0;
    let unresolvedPaymentLinks = 0;
    let reconciledSettlements = 0;
    let unresolvedSettlements = 0;
    let nextBankSyncCursor: string | undefined;
    try {
      if (integration.kind === 'OPEN_BANKING') {
        const providerData = await this.collectOpenBankingPages(
          adapter,
          tokens,
          integration.lastSyncAt ? new Date(integration.lastSyncAt) : undefined,
          this.metadataSyncCursor(integration.metadata),
        );
        nextBankSyncCursor = providerData.nextSyncCursor;

        const seenAccountIds = Array.from(new Set(providerData.accounts.map((account) => account.externalAccountId)));
        for (const account of providerData.accounts) {
          await this.prisma.$executeRawUnsafe(
            `INSERT INTO bank_accounts(
               id,tenant_id,company_id,branch_id,integration_id,external_account_id,bank_name,account_name,
               iban_masked,currency,current_balance,available_balance,balance_as_of,active,updated_at
             ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,$7,$8,$9,$10,$11,$12,$13,TRUE,NOW())
             ON CONFLICT(integration_id,external_account_id) DO UPDATE SET
               bank_name=EXCLUDED.bank_name,account_name=EXCLUDED.account_name,iban_masked=EXCLUDED.iban_masked,
               currency=EXCLUDED.currency,current_balance=EXCLUDED.current_balance,
               available_balance=EXCLUDED.available_balance,balance_as_of=EXCLUDED.balance_as_of,
               active=TRUE,updated_at=NOW()`,
            randomUUID(),
            integration.tenantId,
            integration.companyId,
            integration.branchId,
            integrationId,
            account.externalAccountId,
            account.bankName,
            account.accountName,
            account.ibanMasked ?? null,
            account.currency,
            account.currentBalance ?? null,
            account.availableBalance ?? null,
            account.balanceAsOf ?? new Date(),
          );
          records += 1;
        }

        await this.prisma.$executeRawUnsafe(
          `UPDATE bank_accounts
           SET active=FALSE,updated_at=NOW()
           WHERE integration_id=$1::text AND tenant_id=$2::text AND company_id=$3::text
             AND ($4::text IS NULL OR branch_id=$4::text)
             AND NOT (external_account_id = ANY($5::text[]))`,
          integrationId,
          integration.tenantId,
          integration.companyId,
          integration.branchId,
          seenAccountIds,
        );

        for (const transaction of providerData.transactions) {
          const accountRows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM bank_accounts
             WHERE integration_id=$1::text AND external_account_id=$2
               AND tenant_id=$3::text AND company_id=$4::text
               AND ($5::text IS NULL OR branch_id=$5::text)
             LIMIT 1`,
            integrationId,
            transaction.externalAccountId,
            integration.tenantId,
            integration.companyId,
            integration.branchId,
          );
          if (!accountRows.length) continue;
          const inserted = await this.prisma.$executeRawUnsafe(
            `INSERT INTO bank_transactions(
               id,tenant_id,company_id,branch_id,bank_account_id,external_transaction_id,booked_at,value_at,
               amount,currency,description,counterparty_name,counterparty_iban_masked
             ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,$7,$8,$9,$10,$11,$12,$13)
             ON CONFLICT(bank_account_id,external_transaction_id) DO NOTHING`,
            randomUUID(),
            integration.tenantId,
            integration.companyId,
            integration.branchId,
            accountRows[0].id,
            transaction.externalTransactionId,
            transaction.bookedAt,
            transaction.valueAt ?? null,
            transaction.amount,
            transaction.currency,
            transaction.description ?? null,
            transaction.counterpartyName ?? null,
            transaction.counterpartyIbanMasked ?? null,
          );
          records += inserted;
        }

        const reconciliation = await this.reconciliation.autoMatchInScope(
          {
            tenantId: integration.tenantId,
            companyId: integration.companyId,
            branchId: integration.branchId,
          },
          250,
        );
        reconciledSettlements = reconciliation.matched;
        unresolvedSettlements = reconciliation.skipped;
      }

      if (integration.kind === 'VIRTUAL_POS') {
        if (!adapter.listPosTransactions) {
          throw new BadRequestException('Provider does not support POS transaction synchronization.');
        }
        const terminalRows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM pos_terminals
           WHERE integration_id=$1::text AND tenant_id=$2::text AND company_id=$3::text
             AND ($4::text IS NULL OR branch_id=$4::text) AND active=TRUE
           ORDER BY created_at LIMIT 1`,
          integrationId,
          integration.tenantId,
          integration.companyId,
          integration.branchId,
        );
        let terminalId = terminalRows[0]?.id;
        if (!terminalId) {
          terminalId = randomUUID();
          await this.prisma.$executeRawUnsafe(
            `INSERT INTO pos_terminals(id,tenant_id,company_id,branch_id,integration_id,name,currency)
             VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,'TRY')`,
            terminalId,
            integration.tenantId,
            integration.companyId,
            integration.branchId,
            integrationId,
            `${integration.provider} POS`,
          );
        }
        const transactions = await adapter.listPosTransactions(
          tokens,
          integration.lastSyncAt ? new Date(integration.lastSyncAt) : undefined,
        );
        for (const transaction of transactions) {
          const posRows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
            `INSERT INTO pos_transactions(
               id,tenant_id,company_id,branch_id,terminal_id,provider_transaction_id,status,amount,
               fee_amount,net_amount,currency,expected_settlement_at,created_at,updated_at
             ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
             ON CONFLICT(company_id,provider_transaction_id) DO UPDATE SET
               status=EXCLUDED.status,amount=EXCLUDED.amount,fee_amount=EXCLUDED.fee_amount,
               net_amount=EXCLUDED.net_amount,currency=EXCLUDED.currency,
               expected_settlement_at=EXCLUDED.expected_settlement_at,updated_at=NOW()
             RETURNING id`,
            randomUUID(),
            integration.tenantId,
            integration.companyId,
            integration.branchId,
            terminalId,
            transaction.externalTransactionId,
            transaction.status,
            transaction.grossAmount,
            transaction.feeAmount,
            transaction.netAmount,
            transaction.currency,
            transaction.expectedSettlementAt ?? null,
            transaction.occurredAt,
          );
          records += 1;

          const posTransactionId = posRows[0]?.id;
          if (posTransactionId && integration.branchId && ['AUTHORIZED', 'CAPTURED'].includes(transaction.status)) {
            const link = await this.paymentLinkage.autoLinkOneInScope(
              {
                tenantId: integration.tenantId,
                companyId: integration.companyId,
                branchId: integration.branchId,
              },
              posTransactionId,
            );
            if (link.linked) linkedPayments += 1;
            else unresolvedPaymentLinks += 1;
          }
        }
      }

      await this.prisma.$transaction([
        this.prisma.$executeRawUnsafe(
          `UPDATE finance_integrations
           SET last_sync_at=NOW(),last_error=NULL,
               metadata=CASE WHEN $2::text IS NULL THEN metadata
                 ELSE jsonb_set(metadata,'{bankTransactionSyncCursor}',to_jsonb($2::text),TRUE) END,
               updated_at=NOW()
           WHERE id=$1::text`,
          integrationId,
          nextBankSyncCursor ?? null,
        ),
        this.prisma.$executeRawUnsafe(
          `UPDATE finance_integration_sync_runs
           SET status='SUCCESS',completed_at=NOW(),records_synced=$2 WHERE id=$1::text`,
          runId,
          records,
        ),
      ]);
      return {
        integrationId,
        recordsSynced: records,
        linkedPayments,
        unresolvedPaymentLinks,
        reconciledSettlements,
        unresolvedSettlements,
        status: 'SUCCESS',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown integration sync error';
      await this.prisma.$transaction([
        this.prisma.$executeRawUnsafe(
          `UPDATE finance_integrations SET last_error=$2,updated_at=NOW() WHERE id=$1::text`,
          integrationId,
          message.slice(0, 1000),
        ),
        this.prisma.$executeRawUnsafe(
          `UPDATE finance_integration_sync_runs
           SET status='FAILED',completed_at=NOW(),records_synced=$2,error_message=$3 WHERE id=$1::text`,
          runId,
          records,
          message.slice(0, 1000),
        ),
      ]);
      throw error;
    }
  }

  async syncAllConnected() {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM finance_integrations WHERE status='CONNECTED' ORDER BY COALESCE(last_sync_at,'epoch') ASC`,
    );
    const results: Array<{
      integrationId: string;
      ok: boolean;
      records?: number;
      linkedPayments?: number;
      unresolvedPaymentLinks?: number;
      reconciledSettlements?: number;
      unresolvedSettlements?: number;
      error?: string;
    }> = [];
    for (const row of rows) {
      try {
        const result = await this.syncIntegrationInternal(row.id);
        results.push({
          integrationId: row.id,
          ok: true,
          records: result.recordsSynced,
          linkedPayments: result.linkedPayments,
          unresolvedPaymentLinks: result.unresolvedPaymentLinks,
          reconciledSettlements: result.reconciledSettlements,
          unresolvedSettlements: result.unresolvedSettlements,
        });
      } catch (error) {
        results.push({
          integrationId: row.id,
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown sync error',
        });
      }
    }
    return results;
  }
}
