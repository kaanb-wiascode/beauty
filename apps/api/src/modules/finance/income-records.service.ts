import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { assertIncomeAmounts, assertIncomeApprovalTransition, IncomeApprovalStatus } from './domain/income-policy';

interface CreateIncomeInput {
  categoryId: string;
  costCenterId?: string;
  counterpartyName?: string;
  counterpartyTaxNumber?: string;
  documentType?: string;
  documentNumber?: string;
  documentDate?: Date;
  documentUrl?: string;
  transactionDate: Date;
  dueDate?: Date;
  grossAmount: number;
  netAmount: number;
  taxAmount: number;
  currency: string;
  exchangeRate: number;
  description?: string;
  sourceType?: string;
  sourceId?: string;
}

type UpdateIncomeInput = Partial<CreateIncomeInput> & { version: number };

interface IncomeRow {
  id: string;
  tenantId: string;
  companyId: string;
  branchId: string | null;
  costCenterId: string | null;
  categoryId: string;
  counterpartyName: string | null;
  counterpartyTaxNumber: string | null;
  documentType: string | null;
  documentNumber: string | null;
  documentDate: Date | null;
  documentUrl: string | null;
  transactionDate: Date;
  dueDate: Date | null;
  grossAmount: Prisma.Decimal;
  netAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  currency: string;
  exchangeRate: Prisma.Decimal;
  description: string | null;
  approvalStatus: IncomeApprovalStatus;
  collectionStatus: string;
  reconciliationStatus: string;
  accountingStatus: string;
  sourceType: string | null;
  sourceId: string | null;
  version: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const INCOME_SELECT = `id,tenant_id AS "tenantId",company_id AS "companyId",branch_id AS "branchId",cost_center_id AS "costCenterId",
  category_id AS "categoryId",counterparty_name AS "counterpartyName",counterparty_tax_number AS "counterpartyTaxNumber",
  document_type AS "documentType",document_number AS "documentNumber",document_date AS "documentDate",document_url AS "documentUrl",
  transaction_date AS "transactionDate",due_date AS "dueDate",gross_amount AS "grossAmount",net_amount AS "netAmount",tax_amount AS "taxAmount",
  currency,exchange_rate AS "exchangeRate",description,approval_status AS "approvalStatus",collection_status AS "collectionStatus",
  reconciliation_status AS "reconciliationStatus",accounting_status AS "accountingStatus",source_type AS "sourceType",source_id AS "sourceId",
  version,created_by AS "createdBy",created_at AS "createdAt",updated_at AS "updatedAt"`;

@Injectable()
export class IncomeRecordsService {
  constructor(private readonly prisma: PrismaService, private readonly tenantContext: TenantContext) {}

  private context() {
    return {
      tenantId: this.tenantContext.getTenantId(),
      companyId: this.tenantContext.getCompanyId(),
      branchId: this.tenantContext.getBranchId(),
    };
  }

  private map(row: IncomeRow) {
    return {
      ...row,
      grossAmount: Number(row.grossAmount),
      netAmount: Number(row.netAmount),
      taxAmount: Number(row.taxAmount),
      exchangeRate: Number(row.exchangeRate),
    };
  }

  private validateSourcePair(sourceType?: string | null, sourceId?: string | null) {
    if ((sourceType && !sourceId) || (!sourceType && sourceId)) {
      throw new BadRequestException('Income source type and source id must be provided together.');
    }
  }

  private validateAmounts(input: { grossAmount: number; netAmount: number; taxAmount: number; exchangeRate: number }) {
    try {
      assertIncomeAmounts(input);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  private async acquireLock(tx: Prisma.TransactionClient, companyId: string, key: string) {
    await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`, `income:${companyId}`, key);
  }

  private async validateDimensions(tx: Prisma.TransactionClient, categoryId: string, costCenterId?: string | null) {
    const { tenantId, companyId } = this.context();
    const category = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM income_categories WHERE id=$1::text AND tenant_id=$2::text
       AND (company_id IS NULL OR company_id=$3::text) AND active=true LIMIT 1`,
      categoryId,
      tenantId,
      companyId,
    );
    if (!category.length) throw new NotFoundException('Income category not found');

    if (costCenterId) {
      const costCenter = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM finance_cost_centers WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND active=true LIMIT 1`,
        costCenterId,
        tenantId,
        companyId,
      );
      if (!costCenter.length) throw new NotFoundException('Cost center not found');
    }
  }

  private async getForUpdate(tx: Prisma.TransactionClient, id: string): Promise<IncomeRow> {
    const { tenantId, companyId, branchId } = this.context();
    await this.acquireLock(tx, companyId, id);
    const rows = await tx.$queryRawUnsafe<IncomeRow[]>(
      `SELECT ${INCOME_SELECT} FROM income_records
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND ($4::text IS NULL OR branch_id=$4::text)
       LIMIT 1`,
      id,
      tenantId,
      companyId,
      branchId,
    );
    if (!rows.length) throw new NotFoundException('Income record not found');
    return rows[0];
  }

  private async audit(
    tx: Prisma.TransactionClient,
    row: IncomeRow,
    actorId: string,
    eventType: string,
    reason?: string,
    beforeState?: unknown,
  ) {
    await tx.$executeRawUnsafe(
      `INSERT INTO income_audit_events(
         id,tenant_id,company_id,branch_id,income_record_id,actor_id,event_type,reason,before_state,after_state
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8,$9::jsonb,$10::jsonb)`,
      randomUUID(),
      row.tenantId,
      row.companyId,
      row.branchId,
      row.id,
      actorId,
      eventType,
      reason ?? null,
      beforeState ? JSON.stringify(beforeState) : null,
      JSON.stringify(this.map(row)),
    );
  }

  async create(input: CreateIncomeInput, actorId: string) {
    this.validateSourcePair(input.sourceType, input.sourceId);
    this.validateAmounts(input);
    const { tenantId, companyId, branchId } = this.context();

    return this.prisma.$transaction(async (tx) => {
      await this.validateDimensions(tx, input.categoryId, input.costCenterId);
      if (input.sourceType && input.sourceId) {
        await this.acquireLock(tx, companyId, `${input.sourceType}:${input.sourceId}`);
        const existing = await tx.$queryRawUnsafe<IncomeRow[]>(
          `SELECT ${INCOME_SELECT} FROM income_records
           WHERE tenant_id=$1::text AND company_id=$2::text AND source_type=$3 AND source_id=$4 LIMIT 1`,
          tenantId,
          companyId,
          input.sourceType,
          input.sourceId,
        );
        if (existing.length) return { ...this.map(existing[0]), idempotent: true };
      }

      const id = randomUUID();
      const rows = await tx.$queryRawUnsafe<IncomeRow[]>(
        `INSERT INTO income_records(
           id,tenant_id,company_id,branch_id,cost_center_id,category_id,counterparty_name,counterparty_tax_number,
           document_type,document_number,document_date,document_url,transaction_date,due_date,gross_amount,net_amount,tax_amount,
           currency,exchange_rate,description,source_type,source_id,created_by,updated_at
         ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::text,CURRENT_TIMESTAMP)
         RETURNING ${INCOME_SELECT}`,
        id,
        tenantId,
        companyId,
        branchId,
        input.costCenterId ?? null,
        input.categoryId,
        input.counterpartyName ?? null,
        input.counterpartyTaxNumber ?? null,
        input.documentType ?? null,
        input.documentNumber ?? null,
        input.documentDate ?? null,
        input.documentUrl ?? null,
        input.transactionDate,
        input.dueDate ?? null,
        input.grossAmount,
        input.netAmount,
        input.taxAmount,
        input.currency,
        input.exchangeRate,
        input.description ?? null,
        input.sourceType ?? null,
        input.sourceId ?? null,
        actorId,
      );
      await this.audit(tx, rows[0], actorId, 'INCOME_CREATED');
      return this.map(rows[0]);
    });
  }

  async list(limit = 50) {
    const { tenantId, companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<IncomeRow[]>(
      `SELECT ${INCOME_SELECT} FROM income_records
       WHERE tenant_id=$1::text AND company_id=$2::text AND ($3::text IS NULL OR branch_id=$3::text)
       ORDER BY transaction_date DESC,created_at DESC LIMIT $4`,
      tenantId,
      companyId,
      branchId,
      limit,
    );
    return rows.map((row) => this.map(row));
  }

  async get(id: string) {
    const { tenantId, companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<IncomeRow[]>(
      `SELECT ${INCOME_SELECT} FROM income_records
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND ($4::text IS NULL OR branch_id=$4::text) LIMIT 1`,
      id,
      tenantId,
      companyId,
      branchId,
    );
    if (!rows.length) throw new NotFoundException('Income record not found');
    return this.map(rows[0]);
  }

  async update(id: string, input: UpdateIncomeInput, actorId: string) {
    const { tenantId, companyId } = this.context();
    return this.prisma.$transaction(async (tx) => {
      const current = await this.getForUpdate(tx, id);
      if (!['DRAFT', 'REJECTED'].includes(current.approvalStatus)) {
        throw new BadRequestException('Only draft or rejected income records can be edited.');
      }
      if (current.version !== input.version) {
        throw new ConflictException('Income record was modified by another request. Refresh and retry.');
      }

      const categoryId = input.categoryId ?? current.categoryId;
      const costCenterId = input.costCenterId ?? current.costCenterId;
      const sourceType = input.sourceType ?? current.sourceType;
      const sourceId = input.sourceId ?? current.sourceId;
      this.validateSourcePair(sourceType, sourceId);
      await this.validateDimensions(tx, categoryId, costCenterId);

      const amounts = {
        grossAmount: input.grossAmount ?? Number(current.grossAmount),
        netAmount: input.netAmount ?? Number(current.netAmount),
        taxAmount: input.taxAmount ?? Number(current.taxAmount),
        exchangeRate: input.exchangeRate ?? Number(current.exchangeRate),
      };
      this.validateAmounts(amounts);

      if (sourceType && sourceId) {
        await this.acquireLock(tx, companyId, `${sourceType}:${sourceId}`);
        const duplicate = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM income_records
           WHERE tenant_id=$1::text AND company_id=$2::text AND source_type=$3 AND source_id=$4 AND id<>$5::text
           LIMIT 1`,
          tenantId,
          companyId,
          sourceType,
          sourceId,
          id,
        );
        if (duplicate.length) throw new ConflictException('Income source is already linked to another record.');
      }

      const rows = await tx.$queryRawUnsafe<IncomeRow[]>(
        `UPDATE income_records SET
           category_id=$1::text,cost_center_id=$2::text,counterparty_name=$3,counterparty_tax_number=$4,
           document_type=$5,document_number=$6,document_date=$7,document_url=$8,transaction_date=$9,due_date=$10,
           gross_amount=$11,net_amount=$12,tax_amount=$13,currency=$14,exchange_rate=$15,description=$16,
           source_type=$17,source_id=$18,version=version+1,updated_at=CURRENT_TIMESTAMP
         WHERE id=$19::text AND version=$20
         RETURNING ${INCOME_SELECT}`,
        categoryId,
        costCenterId,
        input.counterpartyName ?? current.counterpartyName,
        input.counterpartyTaxNumber ?? current.counterpartyTaxNumber,
        input.documentType ?? current.documentType,
        input.documentNumber ?? current.documentNumber,
        input.documentDate ?? current.documentDate,
        input.documentUrl ?? current.documentUrl,
        input.transactionDate ?? current.transactionDate,
        input.dueDate ?? current.dueDate,
        amounts.grossAmount,
        amounts.netAmount,
        amounts.taxAmount,
        input.currency ?? current.currency,
        amounts.exchangeRate,
        input.description ?? current.description,
        sourceType,
        sourceId,
        id,
        input.version,
      );
      if (!rows.length) throw new ConflictException('Income record was modified by another request. Refresh and retry.');
      await this.audit(tx, rows[0], actorId, 'INCOME_UPDATED', undefined, this.map(current));
      return this.map(rows[0]);
    });
  }

  async transitionApproval(id: string, next: IncomeApprovalStatus, actorId: string, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.getForUpdate(tx, id);
      try {
        assertIncomeApprovalTransition(current.approvalStatus, next);
      } catch (error) {
        throw new BadRequestException((error as Error).message);
      }
      const updated = await tx.$queryRawUnsafe<IncomeRow[]>(
        `UPDATE income_records SET approval_status=$1::"FinanceApprovalStatus",version=version+1,updated_at=CURRENT_TIMESTAMP
         WHERE id=$2::text RETURNING ${INCOME_SELECT}`,
        next,
        id,
      );
      await this.audit(tx, updated[0], actorId, `INCOME_${next}`, reason, this.map(current));
      return this.map(updated[0]);
    });
  }
}
