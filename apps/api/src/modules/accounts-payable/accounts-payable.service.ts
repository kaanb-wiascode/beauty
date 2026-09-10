import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

interface CreateBillInput {
  supplierId: string;
  invoiceNumber?: string;
  description: string;
  amount: number;
  dueAt?: Date;
}

interface PayBillInput {
  amount: number;
  method: 'CASH' | 'CARD' | 'TRANSFER';
  reference?: string;
  note?: string;
}

interface ListBillsInput {
  status?: 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
  supplierId?: string;
}

@Injectable()
export class AccountsPayableService {
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

  private async ensureAccount(
    tx: Prisma.TransactionClient,
    tenantId: string,
    companyId: string,
    code: string,
    name: string,
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE',
  ) {
    const existing = await tx.chartOfAccount.findFirst({
      where: { tenantId, companyId, code },
      select: { id: true, active: true },
    });
    if (existing) {
      if (!existing.active) {
        return tx.chartOfAccount.update({
          where: { id: existing.id },
          data: { active: true },
          select: { id: true },
        });
      }
      return existing;
    }
    return tx.chartOfAccount.create({
      data: { tenantId, companyId, code, name, type },
      select: { id: true },
    });
  }

  private journalNumber(date: Date) {
    return `JE-${date.toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private async postJournal(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      companyId: string;
      branchId: string | null;
      referenceType: string;
      referenceId: string;
      description: string;
      entryDate: Date;
      debitAccountId: string;
      creditAccountId: string;
      amount: number;
    },
  ) {
    const existing = await tx.journalEntry.findFirst({
      where: {
        companyId: input.companyId,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
      },
      select: { id: true },
    });
    if (existing) return existing;

    return tx.journalEntry.create({
      data: {
        tenantId: input.tenantId,
        companyId: input.companyId,
        branchId: input.branchId,
        number: this.journalNumber(input.entryDate),
        status: 'POSTED',
        entryDate: input.entryDate,
        description: input.description,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        postedAt: new Date(),
        lines: {
          create: [
            { accountId: input.debitAccountId, debit: input.amount, credit: 0 },
            { accountId: input.creditAccountId, debit: 0, credit: input.amount },
          ],
        },
      },
      select: { id: true },
    });
  }

  async createBill(input: CreateBillInput) {
    const { tenantId, companyId, branchId } = this.context();
    const amount = Math.round((input.amount + Number.EPSILON) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Bill amount must be greater than zero.');
    }

    return this.prisma.$transaction(async (tx) => {
      const suppliers = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM inventory_suppliers WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND status='ACTIVE' LIMIT 1`,
        input.supplierId,
        tenantId,
        companyId,
      );
      if (!suppliers.length) throw new NotFoundException('Supplier not found');

      const billId = randomUUID();
      const rows = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO supplier_bills(id,tenant_id,company_id,branch_id,supplier_id,invoice_number,description,amount,due_at)
         VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,$7,$8,$9)
         RETURNING id,supplier_id AS "supplierId",invoice_number AS "invoiceNumber",description,amount,due_at AS "dueAt",status,created_at AS "createdAt"`,
        billId,
        tenantId,
        companyId,
        branchId,
        input.supplierId,
        input.invoiceNumber?.trim() || null,
        input.description.trim(),
        amount,
        input.dueAt ?? null,
      );

      const expense = await this.ensureAccount(tx, tenantId, companyId, '770', 'Genel Yönetim Giderleri', 'EXPENSE');
      const payable = await this.ensureAccount(tx, tenantId, companyId, '320', 'Satıcılar', 'LIABILITY');
      await this.postJournal(tx, {
        tenantId,
        companyId,
        branchId,
        referenceType: 'SUPPLIER_BILL',
        referenceId: billId,
        description: `Tedarikçi faturası ${input.invoiceNumber?.trim() || billId}`,
        entryDate: new Date(),
        debitAccountId: expense.id,
        creditAccountId: payable.id,
        amount,
      });

      return rows[0];
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async listBills(input: ListBillsInput) {
    const { companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT b.id,b.supplier_id AS "supplierId",s.name AS "supplierName",b.invoice_number AS "invoiceNumber",
              b.description,b.amount,b.due_at AS "dueAt",b.status,b.created_at AS "createdAt",
              COALESCE(SUM(p.amount),0)::numeric AS paid,
              (b.amount-COALESCE(SUM(p.amount),0))::numeric AS balance
       FROM supplier_bills b
       JOIN inventory_suppliers s ON s.id=b.supplier_id
       LEFT JOIN supplier_bill_payments p ON p.supplier_bill_id=b.id
       WHERE b.company_id=$1::text
         AND ($2::text IS NULL OR b.branch_id=$2::text)
         AND ($3::text IS NULL OR b.status::text=$3::text)
         AND ($4::text IS NULL OR b.supplier_id=$4::text)
       GROUP BY b.id,s.name
       ORDER BY COALESCE(b.due_at,b.created_at) ASC,b.created_at DESC`,
      companyId,
      branchId,
      input.status ?? null,
      input.supplierId ?? null,
    );
  }

  async getBill(id: string) {
    const { companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT b.id,b.supplier_id AS "supplierId",s.name AS "supplierName",b.invoice_number AS "invoiceNumber",
              b.description,b.amount,b.due_at AS "dueAt",b.status,b.created_at AS "createdAt",
              COALESCE((SELECT SUM(p.amount) FROM supplier_bill_payments p WHERE p.supplier_bill_id=b.id),0)::numeric AS paid,
              (b.amount-COALESCE((SELECT SUM(p.amount) FROM supplier_bill_payments p WHERE p.supplier_bill_id=b.id),0))::numeric AS balance
       FROM supplier_bills b JOIN inventory_suppliers s ON s.id=b.supplier_id
       WHERE b.id=$1::text AND b.company_id=$2::text AND ($3::text IS NULL OR b.branch_id=$3::text) LIMIT 1`,
      id,
      companyId,
      branchId,
    );
    if (!rows.length) throw new NotFoundException('Supplier bill not found');

    const payments = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,amount,method,reference,note,paid_at AS "paidAt" FROM supplier_bill_payments
       WHERE supplier_bill_id=$1::text ORDER BY paid_at DESC`,
      id,
    );
    return { ...rows[0], payments };
  }

  async payBill(id: string, input: PayBillInput) {
    const { tenantId, companyId, branchId } = this.context();
    const amount = Math.round((input.amount + Number.EPSILON) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero.');
    }

    await this.prisma.$transaction(async (tx) => {
      const bills = await tx.$queryRawUnsafe<any[]>(
        `SELECT b.id,b.amount,b.status,
                COALESCE((SELECT SUM(p.amount) FROM supplier_bill_payments p WHERE p.supplier_bill_id=b.id),0)::numeric AS paid
         FROM supplier_bills b
         WHERE b.id=$1::text AND b.company_id=$2::text AND ($3::text IS NULL OR b.branch_id=$3::text)
         FOR UPDATE`,
        id,
        companyId,
        branchId,
      );
      if (!bills.length) throw new NotFoundException('Supplier bill not found');
      const bill = bills[0];
      if (bill.status === 'CANCELLED') throw new BadRequestException('Cancelled bills cannot be paid.');

      const remaining = Math.round((Number(bill.amount) - Number(bill.paid) + Number.EPSILON) * 100) / 100;
      if (remaining <= 0) throw new BadRequestException('Supplier bill is already paid.');
      if (amount > remaining) {
        throw new BadRequestException(`Payment exceeds remaining balance of ${remaining.toFixed(2)}.`);
      }

      const paymentId = randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO supplier_bill_payments(id,tenant_id,company_id,branch_id,supplier_bill_id,amount,method,reference,note)
         VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,$7::"PaymentMethod",$8,$9)`,
        paymentId,
        tenantId,
        companyId,
        branchId,
        id,
        amount,
        input.method,
        input.reference?.trim() || null,
        input.note?.trim() || null,
      );

      const payable = await this.ensureAccount(tx, tenantId, companyId, '320', 'Satıcılar', 'LIABILITY');
      const paymentAccount = input.method === 'CASH'
        ? await this.ensureAccount(tx, tenantId, companyId, '100', 'Kasa', 'ASSET')
        : await this.ensureAccount(tx, tenantId, companyId, '102', 'Bankalar', 'ASSET');

      await this.postJournal(tx, {
        tenantId,
        companyId,
        branchId,
        referenceType: 'SUPPLIER_BILL_PAYMENT',
        referenceId: paymentId,
        description: `Tedarikçi ödemesi ${id}`,
        entryDate: new Date(),
        debitAccountId: payable.id,
        creditAccountId: paymentAccount.id,
        amount,
      });

      const after = Math.round((remaining - amount + Number.EPSILON) * 100) / 100;
      const status = after <= 0 ? 'PAID' : 'PARTIALLY_PAID';
      await tx.$executeRawUnsafe(
        `UPDATE supplier_bills SET status=$2::"SupplierBillStatus",updated_at=NOW() WHERE id=$1::text`,
        id,
        status,
      );
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return this.getBill(id);
  }

  async summary() {
    const { companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*)::int AS "billCount",
              COALESCE(SUM(b.amount),0)::numeric AS "totalBills",
              COALESCE(SUM(COALESCE(p.paid,0)),0)::numeric AS paid,
              COALESCE(SUM(b.amount-COALESCE(p.paid,0)),0)::numeric AS outstanding,
              COUNT(*) FILTER (WHERE b.due_at<NOW() AND b.status IN ('OPEN','PARTIALLY_PAID'))::int AS "overdueCount"
       FROM supplier_bills b
       LEFT JOIN (SELECT supplier_bill_id,SUM(amount) AS paid FROM supplier_bill_payments GROUP BY supplier_bill_id) p
         ON p.supplier_bill_id=b.id
       WHERE b.company_id=$1::text AND ($2::text IS NULL OR b.branch_id=$2::text) AND b.status<>'CANCELLED'`,
      companyId,
      branchId,
    );
    return rows[0] ?? { billCount: 0, totalBills: 0, paid: 0, outstanding: 0, overdueCount: 0 };
  }
}
