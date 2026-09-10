import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { IntegrationSecretVaultService } from './integration-secret-vault.service';
import { ProviderRegistryService } from './provider-registry.service';
import { PosBankReconciliationService } from './pos-bank-reconciliation.service';
import { PosSalePaymentLinkageService } from './pos-sale-payment-linkage.service';

interface IntegrationScope {
  tenantId: string;
  companyId: string;
  branchId: string | null;
}

@Injectable()
export class FinancialIntegrationSyncService {
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

  async syncIntegration(integrationId: string) {
    return this.syncIntegrationInternal(integrationId, this.context());
  }

  private async syncIntegrationInternal(integrationId: string, scope?: IntegrationScope) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,tenant_id AS "tenantId",company_id AS "companyId",branch_id AS "branchId",
              kind,provider,status,last_sync_at AS "lastSyncAt"
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
    const tokens = await this.vault.load(integrationId);
    if (!tokens) throw new BadRequestException('Integration credentials are missing.');

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
    try {
      if (integration.kind === 'OPEN_BANKING') {
        if (!adapter.listBankAccounts) {
          throw new BadRequestException('Provider does not support bank account synchronization.');
        }
        const accounts = await adapter.listBankAccounts(tokens);
        for (const account of accounts) {
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

        if (adapter.listBankTransactions) {
          const transactions = await adapter.listBankTransactions(
            tokens,
            integration.lastSyncAt ? new Date(integration.lastSyncAt) : undefined,
          );
          for (const transaction of transactions) {
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
          `UPDATE finance_integrations SET last_sync_at=NOW(),last_error=NULL,updated_at=NOW() WHERE id=$1::text`,
          integrationId,
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
