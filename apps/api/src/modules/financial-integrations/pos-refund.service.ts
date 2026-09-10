import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { IntegrationSecretVaultService } from './integration-secret-vault.service';
import { ProviderRegistryService } from './provider-registry.service';
import { PosFinancialEventsService } from './pos-financial-events.service';

interface RefundInput {
  amount: number;
  externalEventId: string;
}

interface PosRefundRow {
  id: string;
  tenantId: string;
  companyId: string;
  branchId: string | null;
  integrationId: string;
  posTransactionId: string;
  externalEventId: string;
  provider: string;
  providerTransactionId: string;
  amount: number;
  currency: string;
  status: 'PROCESSING' | 'PROVIDER_SUCCEEDED' | 'SUCCEEDED' | 'FAILED';
  providerReference: string | null;
  financialEventId: string | null;
}

interface PosTransactionRow {
  id: string;
  providerTransactionId: string;
  status: string;
  amount: number;
  currency: string;
  branchId: string | null;
  integrationId: string;
  provider: string;
}

@Injectable()
export class PosRefundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly providers: ProviderRegistryService,
    private readonly vault: IntegrationSecretVaultService,
    private readonly financialEvents: PosFinancialEventsService,
  ) {}

  private context() {
    return {
      tenantId: this.tenant.getTenantId(),
      companyId: this.tenant.getCompanyId(),
      branchId: this.tenant.getBranchId(),
    };
  }

  private round(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private selectRefundSql() {
    return `SELECT id,
                   tenant_id AS "tenantId",
                   company_id AS "companyId",
                   branch_id AS "branchId",
                   integration_id AS "integrationId",
                   pos_transaction_id AS "posTransactionId",
                   external_event_id AS "externalEventId",
                   provider,
                   provider_transaction_id AS "providerTransactionId",
                   amount::float8 AS amount,
                   currency,
                   status,
                   provider_reference AS "providerReference",
                   financial_event_id AS "financialEventId"
            FROM pos_refund_requests`;
  }

  private async loadRequest(id: string): Promise<PosRefundRow> {
    const rows = await this.prisma.$queryRawUnsafe<PosRefundRow[]>(
      `${this.selectRefundSql()} WHERE id=$1::text LIMIT 1`,
      id,
    );
    if (!rows.length) throw new NotFoundException('POS refund request not found.');
    return rows[0];
  }

  private async completeAccounting(row: PosRefundRow) {
    const result = await this.financialEvents.recordInScope(
      { tenantId: row.tenantId, companyId: row.companyId, branchId: row.branchId },
      row.posTransactionId,
      {
        eventType: 'REFUND',
        externalEventId: row.externalEventId,
        amount: row.amount,
        occurredAt: new Date(),
      },
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE pos_refund_requests
       SET status='SUCCEEDED',
           financial_event_id=$2::text,
           completed_at=NOW(),
           updated_at=NOW(),
           error_code=NULL
       WHERE id=$1::text AND status='PROVIDER_SUCCEEDED'`,
      row.id,
      result.id,
    );

    return { ...result, providerReference: row.providerReference };
  }

  private async reserve(posTransactionId: string, amount: number, externalEventId: string) {
    const ctx = this.context();
    return this.prisma.$transaction(async (tx) => {
      const transactionRows = await tx.$queryRawUnsafe<PosTransactionRow[]>(
        `SELECT p.id,
                p.provider_transaction_id AS "providerTransactionId",
                p.status,
                p.amount::float8 AS amount,
                p.currency,
                p.branch_id AS "branchId",
                t.integration_id AS "integrationId",
                i.provider
         FROM pos_transactions p
         JOIN pos_terminals t ON t.id=p.terminal_id
         JOIN finance_integrations i ON i.id=t.integration_id
         WHERE p.id=$1::text
           AND p.tenant_id=$2::text
           AND p.company_id=$3::text
           AND ($4::text IS NULL OR p.branch_id=$4::text)
           AND i.tenant_id=$2::text
           AND i.company_id=$3::text
         LIMIT 1
         FOR UPDATE OF p`,
        posTransactionId,
        ctx.tenantId,
        ctx.companyId,
        ctx.branchId,
      );
      if (!transactionRows.length) throw new NotFoundException('POS transaction not found.');
      const transaction = transactionRows[0];
      if (!['CAPTURED', 'REFUNDED'].includes(transaction.status)) {
        throw new BadRequestException('Only captured POS transactions can be refunded.');
      }

      const existingRows = await tx.$queryRawUnsafe<PosRefundRow[]>(
        `${this.selectRefundSql()}
         WHERE tenant_id=$1::text AND company_id=$2::text AND external_event_id=$3
         LIMIT 1`,
        ctx.tenantId,
        ctx.companyId,
        externalEventId,
      );
      if (existingRows.length) return { transaction, existing: existingRows[0], created: null };

      const reservedRows = await tx.$queryRawUnsafe<Array<{ total: number }>>(
        `SELECT COALESCE(SUM(amount),0)::float8 AS total
         FROM pos_refund_requests
         WHERE pos_transaction_id=$1::text
           AND tenant_id=$2::text
           AND company_id=$3::text
           AND status IN ('PROCESSING','PROVIDER_SUCCEEDED','SUCCEEDED')`,
        posTransactionId,
        ctx.tenantId,
        ctx.companyId,
      );
      const reserved = this.round(Number(reservedRows[0]?.total ?? 0));
      if (this.round(reserved + amount) - Number(transaction.amount) > 0.01) {
        throw new BadRequestException('Refund amount exceeds remaining refundable POS balance.');
      }

      const id = randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO pos_refund_requests(
           id,tenant_id,company_id,branch_id,integration_id,pos_transaction_id,
           external_event_id,provider,provider_transaction_id,amount,currency,status
         ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8,$9,$10,$11,'PROCESSING')`,
        id,
        ctx.tenantId,
        ctx.companyId,
        transaction.branchId,
        transaction.integrationId,
        posTransactionId,
        externalEventId,
        transaction.provider,
        transaction.providerTransactionId,
        amount,
        transaction.currency,
      );
      return { transaction, existing: null, created: id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async refund(posTransactionId: string, input: RefundInput) {
    const amount = this.round(input.amount);
    const externalEventId = input.externalEventId.trim();
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Refund amount must be positive.');
    }
    if (!externalEventId) throw new BadRequestException('Refund external event id is required.');

    const reservation = await this.reserve(posTransactionId, amount, externalEventId);
    const transaction = reservation.transaction;

    if (reservation.existing) {
      const existing = reservation.existing;
      if (
        existing.posTransactionId !== posTransactionId ||
        existing.providerTransactionId !== transaction.providerTransactionId ||
        Math.abs(existing.amount - amount) > 0.01
      ) {
        throw new ConflictException('Refund external event id is already used for a different request.');
      }
      if (existing.status === 'SUCCEEDED') {
        return {
          id: existing.id,
          duplicate: true,
          status: existing.status,
          providerReference: existing.providerReference,
          financialEventId: existing.financialEventId,
        };
      }
      if (existing.status === 'PROVIDER_SUCCEEDED') {
        const accounting = await this.completeAccounting(existing);
        return { id: existing.id, duplicate: true, status: 'SUCCEEDED', accounting };
      }
      if (existing.status === 'PROCESSING') {
        throw new ConflictException('Refund request is already processing.');
      }
      throw new ConflictException('Refund request previously failed. Use a new external event id after review.');
    }

    const refundRequestId = reservation.created!;
    const adapter = this.providers.get('VIRTUAL_POS', transaction.provider);
    if (!adapter.capabilities?.posRefunds || !adapter.refundPosTransaction) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE pos_refund_requests SET status='FAILED',error_code='UNSUPPORTED_PROVIDER',updated_at=NOW() WHERE id=$1::text`,
        refundRequestId,
      );
      throw new ServiceUnavailableException('Provider does not support POS refunds.');
    }

    const credentials = await this.vault.loadOpaque(transaction.integrationId);
    if (!credentials) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE pos_refund_requests SET status='FAILED',error_code='CREDENTIALS_MISSING',updated_at=NOW() WHERE id=$1::text`,
        refundRequestId,
      );
      throw new ServiceUnavailableException('Provider credentials are not configured.');
    }

    let providerResult;
    try {
      providerResult = await adapter.refundPosTransaction({
        credentials,
        providerTransactionId: transaction.providerTransactionId,
        merchantReference: transaction.providerTransactionId,
        amount,
        currency: transaction.currency,
        externalEventId,
      });
    } catch (error) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE pos_refund_requests SET status='FAILED',error_code='PROVIDER_REJECTED',updated_at=NOW() WHERE id=$1::text`,
        refundRequestId,
      );
      throw error;
    }

    if (providerResult.providerTransactionId !== transaction.providerTransactionId) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE pos_refund_requests SET status='FAILED',error_code='PROVIDER_REFERENCE_MISMATCH',updated_at=NOW() WHERE id=$1::text`,
        refundRequestId,
      );
      throw new ServiceUnavailableException('Provider refund reference does not match POS transaction.');
    }
    if (
      Math.abs(providerResult.amount - amount) > 0.01 ||
      providerResult.currency.toUpperCase() !== transaction.currency.toUpperCase()
    ) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE pos_refund_requests SET status='FAILED',error_code='PROVIDER_AMOUNT_MISMATCH',updated_at=NOW() WHERE id=$1::text`,
        refundRequestId,
      );
      throw new ServiceUnavailableException('Provider refund amount or currency does not match request.');
    }

    await this.prisma.$executeRawUnsafe(
      `UPDATE pos_refund_requests
       SET status='PROVIDER_SUCCEEDED',provider_reference=$2,provider_succeeded_at=NOW(),updated_at=NOW(),error_code=NULL
       WHERE id=$1::text AND status='PROCESSING'`,
      refundRequestId,
      providerResult.providerReference ?? null,
    );

    const row = await this.loadRequest(refundRequestId);
    const accounting = await this.completeAccounting(row);
    return {
      id: refundRequestId,
      duplicate: false,
      status: 'SUCCEEDED',
      providerReference: providerResult.providerReference,
      accounting,
    };
  }
}
