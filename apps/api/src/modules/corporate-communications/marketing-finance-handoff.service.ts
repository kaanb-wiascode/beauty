import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { AccountsPayableService } from '../accounts-payable/accounts-payable.service';

@Injectable()
export class MarketingFinanceHandoffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly accountsPayable: AccountsPayableService,
  ) {}

  async list(status?: string) {
    const { tenantId, companyId, branchId } = this.tenantContext.getContext();
    return this.prisma.$queryRawUnsafe(
      `SELECT e.id,e.source_type AS "sourceType",e.source_id AS "sourceId",e.period_key AS "periodKey",
              e.vendor_id AS "vendorId",v.name AS "vendorName",e.campaign_id AS "campaignId",
              c.name AS "campaignName",e.supplier_id AS "supplierId",e.supplier_bill_id AS "supplierBillId",
              e.category,e.description,e.amount,e.currency,e.incurred_on AS "incurredOn",e.due_on AS "dueOn",
              e.invoice_number AS "invoiceNumber",e.status,e.expense_account_code AS "expenseAccountCode",
              e.expense_account_name AS "expenseAccountName",e.created_at AS "createdAt"
       FROM corporate_marketing_expenses e
       LEFT JOIN corporate_marketing_vendors v ON v.id=e.vendor_id
       LEFT JOIN corporate_communication_campaigns c ON c.id=e.campaign_id
       WHERE e.tenant_id=$1::text AND e.company_id=$2::text
         AND ($3::text IS NULL OR e.branch_id IS NULL OR e.branch_id=$3::text)
         AND ($4::text IS NULL OR e.status=$4::text)
       ORDER BY e.created_at DESC,e.id`,
      tenantId,
      companyId,
      branchId,
      status ?? null,
    );
  }

  async postToAccountsPayable(
    expenseId: string,
    input: { supplierId: string; invoiceNumber?: string; dueAt?: Date },
    actorUserId: string,
  ) {
    const context = this.tenantContext.getContext();
    const expenses = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        vendorId: string | null;
        supplierBillId: string | null;
        description: string;
        amount: unknown;
        currency: string;
        expenseAccountCode: string;
        expenseAccountName: string;
        status: string;
      }>
    >(
      `SELECT id,vendor_id AS "vendorId",supplier_bill_id AS "supplierBillId",description,amount,currency,
              expense_account_code AS "expenseAccountCode",expense_account_name AS "expenseAccountName",status
       FROM corporate_marketing_expenses
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         AND ($4::text IS NULL OR branch_id IS NULL OR branch_id=$4::text) LIMIT 1`,
      expenseId,
      context.tenantId,
      context.companyId,
      context.branchId,
    );
    if (!expenses.length) throw new NotFoundException('Marketing expense not found.');
    const expense = expenses[0];
    if (expense.supplierBillId && expense.status === 'POSTED') {
      return { expenseId, supplierBillId: expense.supplierBillId, idempotent: true };
    }
    if (!['PENDING_FINANCE', 'APPROVED'].includes(expense.status)) {
      throw new BadRequestException('Marketing expense is not eligible for finance posting.');
    }
    if (expense.currency !== 'TRY') {
      throw new BadRequestException(
        'Foreign-currency marketing expenses must be converted before accounting posting.',
      );
    }

    const supplier = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM inventory_suppliers
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND status='ACTIVE' LIMIT 1`,
      input.supplierId,
      context.tenantId,
      context.companyId,
    );
    if (!supplier.length) throw new BadRequestException('Finance supplier is outside the active company.');

    const bill = await this.accountsPayable.createBill({
      supplierId: input.supplierId,
      invoiceNumber: input.invoiceNumber,
      description: expense.description,
      amount: Number(expense.amount),
      dueAt: input.dueAt,
      sourceType: 'MARKETING_EXPENSE',
      sourceId: expenseId,
      expenseAccountCode: expense.expenseAccountCode,
      expenseAccountName: expense.expenseAccountName,
    });

    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `UPDATE corporate_marketing_expenses
           SET supplier_id=$2::text,supplier_bill_id=$3::text,invoice_number=$4,due_on=$5::date,
               status='POSTED',approved_by_user_id=$6::text,approved_at=COALESCE(approved_at,NOW()),posted_at=COALESCE(posted_at,NOW()),updated_at=NOW()
           WHERE id=$1::text`,
          expenseId,
          input.supplierId,
          bill.id,
          input.invoiceNumber?.trim() || null,
          input.dueAt ?? null,
          actorUserId,
        );
        if (expense.vendorId) {
          await tx.$executeRawUnsafe(
            `UPDATE corporate_marketing_vendors SET supplier_id=$2::text,updated_at=NOW() WHERE id=$1::text`,
            expense.vendorId,
            input.supplierId,
          );
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return { expenseId, supplierBillId: bill.id, idempotent: bill.idempotent };
  }
}
