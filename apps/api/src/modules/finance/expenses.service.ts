import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import {
  assertExpenseAmounts,
  assertExpenseApprovalTransition,
  ExpenseApprovalStatus,
} from './domain/expense-policy';

interface CreateExpenseInput {
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
  withholdingAmount: number;
  currency: string;
  exchangeRate: number;
  description?: string;
  sourceType?: string;
  sourceId?: string;
}

type UpdateExpenseInput = Partial<CreateExpenseInput> & { version: number };

interface ListExpensesInput {
  approvalStatus?: ExpenseApprovalStatus;
  paymentStatus?: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
  accountingStatus?: 'UNPOSTED' | 'READY_TO_POST' | 'POSTED' | 'REVERSED';
  categoryId?: string;
  costCenterId?: string;
  from?: Date;
  to?: Date;
  limit: number;
}

interface ExpenseRow {
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
  withholdingAmount: Prisma.Decimal;
  currency: string;
  exchangeRate: Prisma.Decimal;
  description: string | null;
  approvalStatus: ExpenseApprovalStatus;
  paymentStatus: string;
  reconciliationStatus: string;
  accountingStatus: string;
  sourceType: string | null;
  sourceId: string | null;
  version: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ExpensesService {
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

  private async acquireLock(
    tx: Prisma.TransactionClient,
    companyId: string,
    key: string,
  ): Promise<void> {
    await tx.$queryRawUnsafe(
      `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
      `expense:${companyId}`,
      key,
    );
  }

  private validateSourcePair(sourceType?: string, sourceId?: string) {
    if ((sourceType && !sourceId) || (!sourceType && sourceId)) {
      throw new BadRequestException('Expense source type and source id must be provided together.');
    }
  }

  private validateAmounts(input: Pick<CreateExpenseInput, 'grossAmount' | 'netAmount' | 'taxAmount' | 'withholdingAmount' | 'exchangeRate'>) {
    try {
      assertExpenseAmounts(input);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  private async validateDimensions(
    tx: Prisma.TransactionClient,
    input: { categoryId: string; costCenterId?: string },
  ) {
    const { tenantId, companyId } = this.context();
    const categories = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM expense_categories
       WHERE id=$1::text AND tenant_id=$2::text
         AND (company_id IS NULL OR company_id=$3::text) AND active=true
       LIMIT 1`,
      input.categoryId,
      tenantId,
      companyId,
    );
    if (!categories.length) throw new NotFoundException('Expense category not found');

    if (input.costCenterId) {
      const costCenters = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM finance_cost_centers
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND active=true
         LIMIT 1`,
        input.costCenterId,
        tenantId,
        companyId,
      );
      if (!costCenters.length) throw new NotFoundException('Cost center not found');
    }
  }

  private map(row: ExpenseRow) {
    return {
      ...row,
      grossAmount: Number(row.grossAmount),
      netAmount: Number(row.netAmount),
      taxAmount: Number(row.taxAmount),
      withholdingAmount: Number(row.withholdingAmount),
      exchangeRate: Number(row.exchangeRate),
    };
  }

  private async audit(
    tx: Prisma.TransactionClient,
    input: {
      expenseId: string;
      actorId: string;
      eventType: string;
      reason?: string;
      beforeState?: unknown;
      afterState?: unknown;
    },
  ) {
    const { tenantId, companyId, branchId } = this.context();
    await tx.$executeRawUnsafe(
      `INSERT INTO expense_audit_events(
         id,tenant_id,company_id,branch_id,expense_id,actor_id,event_type,reason,before_state,after_state
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8,$9::jsonb,$10::jsonb)`,
      randomUUID(),
      tenantId,
      companyId,
      branchId,
      input.expenseId,
      input.actorId,
      input.eventType,
      input.reason ?? null,
      input.beforeState ? JSON.stringify(input.beforeState) : null,
      input.afterState ? JSON.stringify(input.afterState) : null,
    );
  }

  async create(input: CreateExpenseInput, actorId: string) {
    this.validateSourcePair(input.sourceType, input.sourceId);
    this.validateAmounts(input);
    const { tenantId, companyId, branchId } = this.context();

    return this.prisma.$transaction(async (tx) => {
      await this.validateDimensions(tx, input);

      if (input.sourceType && input.sourceId) {
        await this.acquireLock(tx, companyId, `${input.sourceType}:${input.sourceId}`);
        const existing = await tx.$queryRawUnsafe<ExpenseRow[]>(
          `SELECT id, tenant_id AS "tenantId", company_id AS "companyId", branch_id AS "branchId",
                  cost_center_id AS "costCenterId", category_id AS "categoryId",
                  counterparty_name AS "counterpartyName", counterparty_tax_number AS "counterpartyTaxNumber",
                  document_type AS "documentType", document_number AS "documentNumber", document_date AS "documentDate",
                  document_url AS "documentUrl", transaction_date AS "transactionDate", due_date AS "dueDate",
                  gross_amount AS "grossAmount", net_amount AS "netAmount", tax_amount AS "taxAmount",
                  withholding_amount AS "withholdingAmount", currency, exchange_rate AS "exchangeRate", description,
                  approval_status AS "approvalStatus", payment_status AS "paymentStatus",
                  reconciliation_status AS "reconciliationStatus", accounting_status AS "accountingStatus",
                  source_type AS "sourceType", source_id AS "sourceId", version, created_by AS "createdBy",
                  created_at AS "createdAt", updated_at AS "updatedAt"
           FROM expenses
           WHERE tenant_id=$1::text AND company_id=$2::text AND source_type=$3 AND source_id=$4
           LIMIT 1`,
          tenantId,
          companyId,
          input.sourceType,
          input.sourceId,
        );
        if (existing.length) return { ...this.map(existing[0]), idempotent: true };
      }

      const id = randomUUID();
      const rows = await tx.$queryRawUnsafe<ExpenseRow[]>(
        `INSERT INTO expenses(
          id,tenant_id,company_id,branch_id,cost_center_id,category_id,counterparty_name,counterparty_tax_number,
          document_type,document_number,document_date,document_url,transaction_date,due_date,gross_amount,net_amount,
          tax_amount,withholding_amount,currency,exchange_rate,description,source_type,source_id,created_by,updated_at
        ) VALUES(
          $1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::text,CURRENT_TIMESTAMP
        ) RETURNING
          id,tenant_id AS "tenantId",company_id AS "companyId",branch_id AS "branchId",cost_center_id AS "costCenterId",
          category_id AS "categoryId",counterparty_name AS "counterpartyName",counterparty_tax_number AS "counterpartyTaxNumber",
          document_type AS "documentType",document_number AS "documentNumber",document_date AS "documentDate",document_url AS "documentUrl",
          transaction_date AS "transactionDate",due_date AS "dueDate",gross_amount AS "grossAmount",net_amount AS "netAmount",
          tax_amount AS "taxAmount",withholding_amount AS "withholdingAmount",currency,exchange_rate AS "exchangeRate",description,
          approval_status AS "approvalStatus",payment_status AS "paymentStatus",reconciliation_status AS "reconciliationStatus",
          accounting_status AS "accountingStatus",source_type AS "sourceType",source_id AS "sourceId",version,created_by AS "createdBy",
          created_at AS "createdAt",updated_at AS "updatedAt"`,
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
        input.withholdingAmount,
        input.currency,
        input.exchangeRate,
        input.description ?? null,
        input.sourceType ?? null,
        input.sourceId ?? null,
        actorId,
      );
      const expense = this.map(rows[0]);
      await this.audit(tx, { expenseId: id, actorId, eventType: 'EXPENSE_CREATED', afterState: expense });
      return expense;
    });
  }

  async list(input: ListExpensesInput) {
    const { tenantId, companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<ExpenseRow[]>(
      `SELECT id,tenant_id AS "tenantId",company_id AS "companyId",branch_id AS "branchId",cost_center_id AS "costCenterId",
              category_id AS "categoryId",counterparty_name AS "counterpartyName",counterparty_tax_number AS "counterpartyTaxNumber",
              document_type AS "documentType",document_number AS "documentNumber",document_date AS "documentDate",document_url AS "documentUrl",
              transaction_date AS "transactionDate",due_date AS "dueDate",gross_amount AS "grossAmount",net_amount AS "netAmount",
              tax_amount AS "taxAmount",withholding_amount AS "withholdingAmount",currency,exchange_rate AS "exchangeRate",description,
              approval_status AS "approvalStatus",payment_status AS "paymentStatus",reconciliation_status AS "reconciliationStatus",
              accounting_status AS "accountingStatus",source_type AS "sourceType",source_id AS "sourceId",version,created_by AS "createdBy",
              created_at AS "createdAt",updated_at AS "updatedAt"
       FROM expenses
       WHERE tenant_id=$1::text AND company_id=$2::text
         AND ($3::text IS NULL OR branch_id=$3::text)
         AND ($4::text IS NULL OR approval_status::text=$4)
         AND ($5::text IS NULL OR payment_status::text=$5)
         AND ($6::text IS NULL OR accounting_status::text=$6)
         AND ($7::text IS NULL OR category_id=$7::text)
         AND ($8::text IS NULL OR cost_center_id=$8::text)
         AND ($9::timestamp IS NULL OR transaction_date >= $9)
         AND ($10::timestamp IS NULL OR transaction_date <= $10)
       ORDER BY transaction_date DESC, created_at DESC
       LIMIT $11`,
      tenantId,
      companyId,
      branchId,
      input.approvalStatus ?? null,
      input.paymentStatus ?? null,
      input.accountingStatus ?? null,
      input.categoryId ?? null,
      input.costCenterId ?? null,
      input.from ?? null,
      input.to ?? null,
      input.limit,
    );
    return rows.map((row) => this.map(row));
  }

  async get(id: string) {
    const { tenantId, companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<ExpenseRow[]>(
      `SELECT id,tenant_id AS "tenantId",company_id AS "companyId",branch_id AS "branchId",cost_center_id AS "costCenterId",
              category_id AS "categoryId",counterparty_name AS "counterpartyName",counterparty_tax_number AS "counterpartyTaxNumber",
              document_type AS "documentType",document_number AS "documentNumber",document_date AS "documentDate",document_url AS "documentUrl",
              transaction_date AS "transactionDate",due_date AS "dueDate",gross_amount AS "grossAmount",net_amount AS "netAmount",
              tax_amount AS "taxAmount",withholding_amount AS "withholdingAmount",currency,exchange_rate AS "exchangeRate",description,
              approval_status AS "approvalStatus",payment_status AS "paymentStatus",reconciliation_status AS "reconciliationStatus",
              accounting_status AS "accountingStatus",source_type AS "sourceType",source_id AS "sourceId",version,created_by AS "createdBy",
              created_at AS "createdAt",updated_at AS "updatedAt"
       FROM expenses
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         AND ($4::text IS NULL OR branch_id=$4::text)
       LIMIT 1`,
      id,
      tenantId,
      companyId,
      branchId,
    );
    if (!rows.length) throw new NotFoundException('Expense not found');
    return this.map(rows[0]);
  }

  async update(id: string, input: UpdateExpenseInput, actorId: string) {
    const { tenantId, companyId, branchId } = this.context();
    this.validateSourcePair(input.sourceType, input.sourceId);

    return this.prisma.$transaction(async (tx) => {
      await this.acquireLock(tx, companyId, id);
      const current = await this.getForUpdate(tx, id, tenantId, companyId, branchId);
      if (!['DRAFT', 'REJECTED'].includes(current.approvalStatus)) {
        throw new BadRequestException('Only draft or rejected expenses can be edited.');
      }
      if (current.version !== input.version) {
        throw new ConflictException('Expense was modified by another request. Refresh and retry.');
      }

      const categoryId = input.categoryId ?? current.categoryId;
      const costCenterId = input.costCenterId ?? current.costCenterId ?? undefined;
      await this.validateDimensions(tx, { categoryId, costCenterId });

      const amounts = {
        grossAmount: input.grossAmount ?? Number(current.grossAmount),
        netAmount: input.netAmount ?? Number(current.netAmount),
        taxAmount: input.taxAmount ?? Number(current.taxAmount),
        withholdingAmount: input.withholdingAmount ?? Number(current.withholdingAmount),
        exchangeRate: input.exchangeRate ?? Number(current.exchangeRate),
      };
      this.validateAmounts(amounts);

      const rows = await tx.$queryRawUnsafe<ExpenseRow[]>(
        `UPDATE expenses SET
          category_id=$1::text,cost_center_id=$2::text,counterparty_name=$3,counterparty_tax_number=$4,
          document_type=$5,document_number=$6,document_date=$7,document_url=$8,transaction_date=$9,due_date=$10,
          gross_amount=$11,net_amount=$12,tax_amount=$13,withholding_amount=$14,currency=$15,exchange_rate=$16,
          description=$17,source_type=$18,source_id=$19,version=version+1,updated_at=CURRENT_TIMESTAMP
         WHERE id=$20::text AND tenant_id=$21::text AND company_id=$22::text AND version=$23
         RETURNING id,tenant_id AS "tenantId",company_id AS "companyId",branch_id AS "branchId",cost_center_id AS "costCenterId",
          category_id AS "categoryId",counterparty_name AS "counterpartyName",counterparty_tax_number AS "counterpartyTaxNumber",
          document_type AS "documentType",document_number AS "documentNumber",document_date AS "documentDate",document_url AS "documentUrl",
          transaction_date AS "transactionDate",due_date AS "dueDate",gross_amount AS "grossAmount",net_amount AS "netAmount",
          tax_amount AS "taxAmount",withholding_amount AS "withholdingAmount",currency,exchange_rate AS "exchangeRate",description,
          approval_status AS "approvalStatus",payment_status AS "paymentStatus",reconciliation_status AS "reconciliationStatus",
          accounting_status AS "accountingStatus",source_type AS "sourceType",source_id AS "sourceId",version,created_by AS "createdBy",
          created_at AS "createdAt",updated_at AS "updatedAt"`,
        categoryId,
        costCenterId ?? null,
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
        amounts.withholdingAmount,
        input.currency ?? current.currency,
        amounts.exchangeRate,
        input.description ?? current.description,
        input.sourceType ?? current.sourceType,
        input.sourceId ?? current.sourceId,
        id,
        tenantId,
        companyId,
        input.version,
      );
      if (!rows.length) throw new ConflictException('Expense was modified by another request.');
      const updated = this.map(rows[0]);
      await this.audit(tx, { expenseId: id, actorId, eventType: 'EXPENSE_UPDATED', beforeState: this.map(current), afterState: updated });
      return updated;
    });
  }

  async transitionApproval(
    id: string,
    next: ExpenseApprovalStatus,
    actorId: string,
    reason?: string,
  ) {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$transaction(async (tx) => {
      await this.acquireLock(tx, companyId, id);
      const current = await this.getForUpdate(tx, id, tenantId, companyId, branchId);
      try {
        assertExpenseApprovalTransition(current.approvalStatus, next);
      } catch (error) {
        throw new BadRequestException((error as Error).message);
      }

      const rows = await tx.$queryRawUnsafe<ExpenseRow[]>(
        `UPDATE expenses
         SET approval_status=$1::"FinanceApprovalStatus",version=version+1,updated_at=CURRENT_TIMESTAMP
         WHERE id=$2::text AND tenant_id=$3::text AND company_id=$4::text
         RETURNING id,tenant_id AS "tenantId",company_id AS "companyId",branch_id AS "branchId",cost_center_id AS "costCenterId",
          category_id AS "categoryId",counterparty_name AS "counterpartyName",counterparty_tax_number AS "counterpartyTaxNumber",
          document_type AS "documentType",document_number AS "documentNumber",document_date AS "documentDate",document_url AS "documentUrl",
          transaction_date AS "transactionDate",due_date AS "dueDate",gross_amount AS "grossAmount",net_amount AS "netAmount",
          tax_amount AS "taxAmount",withholding_amount AS "withholdingAmount",currency,exchange_rate AS "exchangeRate",description,
          approval_status AS "approvalStatus",payment_status AS "paymentStatus",reconciliation_status AS "reconciliationStatus",
          accounting_status AS "accountingStatus",source_type AS "sourceType",source_id AS "sourceId",version,created_by AS "createdBy",
          created_at AS "createdAt",updated_at AS "updatedAt"`,
        next,
        id,
        tenantId,
        companyId,
      );
      const updated = this.map(rows[0]);
      await this.audit(tx, {
        expenseId: id,
        actorId,
        eventType: `EXPENSE_${next}`,
        reason,
        beforeState: this.map(current),
        afterState: updated,
      });
      return updated;
    });
  }

  private async getForUpdate(
    tx: Prisma.TransactionClient,
    id: string,
    tenantId: string,
    companyId: string,
    branchId: string | null,
  ) {
    const rows = await tx.$queryRawUnsafe<ExpenseRow[]>(
      `SELECT id,tenant_id AS "tenantId",company_id AS "companyId",branch_id AS "branchId",cost_center_id AS "costCenterId",
              category_id AS "categoryId",counterparty_name AS "counterpartyName",counterparty_tax_number AS "counterpartyTaxNumber",
              document_type AS "documentType",document_number AS "documentNumber",document_date AS "documentDate",document_url AS "documentUrl",
              transaction_date AS "transactionDate",due_date AS "dueDate",gross_amount AS "grossAmount",net_amount AS "netAmount",
              tax_amount AS "taxAmount",withholding_amount AS "withholdingAmount",currency,exchange_rate AS "exchangeRate",description,
              approval_status AS "approvalStatus",payment_status AS "paymentStatus",reconciliation_status AS "reconciliationStatus",
              accounting_status AS "accountingStatus",source_type AS "sourceType",source_id AS "sourceId",version,created_by AS "createdBy",
              created_at AS "createdAt",updated_at AS "updatedAt"
       FROM expenses
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         AND ($4::text IS NULL OR branch_id=$4::text)
       FOR UPDATE`,
      id,
      tenantId,
      companyId,
      branchId,
    );
    if (!rows.length) throw new NotFoundException('Expense not found');
    return rows[0];
  }
}
