import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { validateJournalLines } from '../accounting/domain/journal-policy';

interface RecordIncomeCollectionInput {
  amount: number;
  collectionAccountId: string;
  method: 'CASH' | 'CARD' | 'TRANSFER' | 'OTHER';
  reference?: string;
  note?: string;
  collectedAt?: Date;
  sourceType?: string;
  sourceId?: string;
}

interface IncomeCollectionContextRow {
  id: string;
  tenantId: string;
  companyId: string;
  branchId: string | null;
  categoryId: string;
  grossAmount: Prisma.Decimal;
  approvalStatus: string;
  accountingStatus: string;
  collectionStatus: string;
}

@Injectable()
export class IncomeCollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    return {
      tenantId: this.tenantContext.getTenantId(),
      companyId: this.tenantContext.getCompanyId(),
      branchId: this.tenantContext.getBranchId(),
    };
  }

  private async acquireLock(tx: Prisma.TransactionClient, namespace: string, key: string) {
    await tx.$queryRawUnsafe(
      `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
      namespace,
      key,
    );
  }

  private validateSourcePair(sourceType?: string, sourceId?: string) {
    if ((sourceType && !sourceId) || (!sourceType && sourceId)) {
      throw new BadRequestException('Collection source type and source id must be provided together.');
    }
  }

  async list(incomeId: string) {
    const { tenantId, companyId, branchId } = this.context();
    await this.assertIncomeVisible(incomeId);
    return this.prisma.$queryRawUnsafe(
      `SELECT c.id,c.income_record_id AS "incomeRecordId",c.collection_account_id AS "collectionAccountId",
              a.code AS "collectionAccountCode",a.name AS "collectionAccountName",c.amount,c.method,c.reference,c.note,
              c.collected_at AS "collectedAt",c.source_type AS "sourceType",c.source_id AS "sourceId",
              c.created_by AS "createdBy",c.created_at AS "createdAt"
       FROM income_collections c
       JOIN chart_of_accounts a ON a.id=c.collection_account_id
       WHERE c.income_record_id=$1::text AND c.tenant_id=$2::text AND c.company_id=$3::text
         AND ($4::text IS NULL OR c.branch_id=$4::text)
       ORDER BY c.collected_at DESC,c.created_at DESC`,
      incomeId,
      tenantId,
      companyId,
      branchId,
    );
  }

  async record(incomeId: string, input: RecordIncomeCollectionInput, actorId: string) {
    this.validateSourcePair(input.sourceType, input.sourceId);
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new BadRequestException('Collection amount must be greater than zero.');
    }

    const { tenantId, companyId } = this.context();
    return this.prisma.$transaction(async (tx) => {
      await this.acquireLock(tx, `income-collection:${companyId}`, incomeId);
      const income = await this.getIncomeForUpdate(tx, incomeId);
      if (income.approvalStatus !== 'APPROVED') {
        throw new BadRequestException('Only approved income records can receive collections.');
      }
      if (income.accountingStatus !== 'POSTED') {
        throw new BadRequestException('Income must be posted to accounting before collection can be recorded.');
      }

      const collectionAccount = await tx.chartOfAccount.findFirst({
        where: {
          id: input.collectionAccountId,
          tenantId,
          companyId,
          active: true,
          type: 'ASSET',
        },
        select: { id: true },
      });
      if (!collectionAccount) {
        throw new BadRequestException('Collection account must be an active asset account in the current company.');
      }

      const mappingRows = await tx.$queryRawUnsafe<Array<{ receivableAccountId: string }>>(
        `SELECT receivable_account_id AS "receivableAccountId"
         FROM income_accounting_mappings
         WHERE tenant_id=$1::text AND company_id=$2::text AND category_id=$3::text AND active=true LIMIT 1`,
        tenantId,
        companyId,
        income.categoryId,
      );
      if (!mappingRows.length) {
        throw new BadRequestException('Income accounting mapping is required before collection can be recorded.');
      }

      if (input.sourceType && input.sourceId) {
        await this.acquireLock(tx, `income-collection-source:${companyId}`, `${input.sourceType}:${input.sourceId}`);
        const existing = await tx.$queryRawUnsafe<Array<{ id: string; amount: Prisma.Decimal }>>(
          `SELECT id,amount FROM income_collections
           WHERE tenant_id=$1::text AND company_id=$2::text AND source_type=$3 AND source_id=$4 LIMIT 1`,
          tenantId,
          companyId,
          input.sourceType,
          input.sourceId,
        );
        if (existing.length) {
          return { id: existing[0].id, amount: Number(existing[0].amount), idempotent: true };
        }
      }

      const totals = await tx.$queryRawUnsafe<Array<{ total: Prisma.Decimal | null }>>(
        `SELECT COALESCE(SUM(amount),0) AS total FROM income_collections
         WHERE income_record_id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,
        income.id,
        tenantId,
        companyId,
      );
      const collected = Number(totals[0]?.total ?? 0);
      const gross = Number(income.grossAmount);
      if (collected + input.amount - gross > 0.01) {
        throw new BadRequestException('Collection would exceed the income gross amount.');
      }

      const collectionId = randomUUID();
      const collectedAt = input.collectedAt ?? new Date();
      const rows = await tx.$queryRawUnsafe<Array<{ id: string; amount: Prisma.Decimal; collectedAt: Date }>>(
        `INSERT INTO income_collections(
           id,tenant_id,company_id,branch_id,income_record_id,collection_account_id,amount,method,reference,note,
           collected_at,source_type,source_id,created_by
         ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8,$9,$10,$11,$12,$13,$14::text)
         RETURNING id,amount,collected_at AS "collectedAt"`,
        collectionId,
        income.tenantId,
        income.companyId,
        income.branchId,
        income.id,
        collectionAccount.id,
        input.amount,
        input.method,
        input.reference?.trim() || null,
        input.note?.trim() || null,
        collectedAt,
        input.sourceType ?? null,
        input.sourceId ?? null,
        actorId,
      );

      const lines = [
        { accountId: collectionAccount.id, debit: input.amount, credit: 0, memo: 'Gelir tahsilatı' },
        { accountId: mappingRows[0].receivableAccountId, debit: 0, credit: input.amount, memo: 'Gelir alacağı kapama' },
      ];
      try {
        validateJournalLines(lines);
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'Collection journal is not balanced.');
      }

      const existingJournal = await tx.journalEntry.findFirst({
        where: { companyId, referenceType: 'INCOME_COLLECTION', referenceId: collectionId },
        select: { id: true },
      });
      const journal = existingJournal ?? await tx.journalEntry.create({
        data: {
          tenantId: income.tenantId,
          companyId: income.companyId,
          branchId: income.branchId,
          number: `JE-${collectedAt.toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`,
          status: 'POSTED',
          entryDate: collectedAt,
          description: `Gelir tahsilatı ${income.id}`,
          referenceType: 'INCOME_COLLECTION',
          referenceId: collectionId,
          postedAt: new Date(),
          lines: { create: lines },
        },
        select: { id: true },
      });

      const newTotal = collected + input.amount;
      const collectionStatus = Math.abs(newTotal - gross) <= 0.01 ? 'COLLECTED' : 'PARTIALLY_COLLECTED';
      await tx.$executeRawUnsafe(
        `UPDATE income_records SET collection_status=$1::"IncomeCollectionStatus",version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=$2::text`,
        collectionStatus,
        income.id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO income_audit_events(
           id,tenant_id,company_id,branch_id,income_record_id,actor_id,event_type,before_state,after_state
         ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,'INCOME_COLLECTION_RECORDED',$7::jsonb,$8::jsonb)`,
        randomUUID(),
        income.tenantId,
        income.companyId,
        income.branchId,
        income.id,
        actorId,
        JSON.stringify({ collectionStatus: income.collectionStatus, collectedAmount: collected }),
        JSON.stringify({ collectionStatus, collectedAmount: newTotal, collectionId }),
      );

      return {
        id: rows[0].id,
        amount: Number(rows[0].amount),
        collectedAt: rows[0].collectedAt,
        collectionStatus,
        collectedAmount: newTotal,
        remainingAmount: Math.max(0, gross - newTotal),
        journalEntryId: journal.id,
      };
    });
  }

  private async assertIncomeVisible(id: string) {
    const { tenantId, companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM income_records
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND ($4::text IS NULL OR branch_id=$4::text) LIMIT 1`,
      id,
      tenantId,
      companyId,
      branchId,
    );
    if (!rows.length) throw new NotFoundException('Income record not found');
  }

  private async getIncomeForUpdate(tx: Prisma.TransactionClient, id: string): Promise<IncomeCollectionContextRow> {
    const { tenantId, companyId, branchId } = this.context();
    const rows = await tx.$queryRawUnsafe<IncomeCollectionContextRow[]>(
      `SELECT id,tenant_id AS "tenantId",company_id AS "companyId",branch_id AS "branchId",category_id AS "categoryId",
              gross_amount AS "grossAmount",approval_status AS "approvalStatus",accounting_status AS "accountingStatus",
              collection_status AS "collectionStatus"
       FROM income_records
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND ($4::text IS NULL OR branch_id=$4::text) LIMIT 1`,
      id,
      tenantId,
      companyId,
      branchId,
    );
    if (!rows.length) throw new NotFoundException('Income record not found');
    return rows[0];
  }
}
