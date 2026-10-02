import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { SupplierExpenseSyncService } from '../finance/supplier-expense-sync.service';

interface CreateBillInput {
  supplierId: string;
  invoiceNumber?: string;
  description: string;
  amount: number;
  dueAt?: Date;
  sourceType?: string;
  sourceId?: string;
  expenseAccountCode?: string;
  expenseAccountName?: string;
}

interface PayBillInput {
  amount: number;
  method: 'CASH' | 'CARD' | 'TRANSFER';
  reference?: string;
  note?: string;
}

interface CancelBillInput {
  reason: string;
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
    private readonly supplierExpenseSync: SupplierExpenseSyncService,
  ) {}

  private context() {
    return {
      tenantId: this.tenantContext.getTenantId(),
      companyId: this.tenantContext.getCompanyId(),
      branchId: this.tenantContext.getBranchId(),
    };
  }

  private round(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private async currentUserId(
    db: Prisma.TransactionClient | PrismaService,
  ): Promise<string> {
    const context = this.tenantContext.getContext();
    const rows = await db.$queryRawUnsafe<Array<{ userId: string }>>(
      `SELECT "userId" AS "userId"
       FROM memberships
       WHERE id=$1::text AND "tenantId"=$2::text AND "companyId"=$3::text
       LIMIT 1`,
      context.membershipId,
      context.tenantId,
      context.companyId,
    );
    if (!rows[0]?.userId) {
      throw new BadRequestException('Oturum açmış kullanıcı bilgisi bulunamadı.');
    }
    return rows[0].userId;
  }

  private async acquireTransactionLock(
    tx: Prisma.TransactionClient,
    namespace: string,
    key: string,
  ): Promise<void> {
    await tx.$queryRawUnsafe<Array<{ locked: number }>>(
      `SELECT 1::int AS locked
       FROM (SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))) AS lock_call`,
      namespace,
      key,
    );
  }

  private async ensureAccount(
    tx: Prisma.TransactionClient,
    tenantId: string,
    companyId: string,
    code: string,
    name: string,
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE',
  ) {
    await this.acquireTransactionLock(tx, `account:${companyId}`, code);

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
    await this.acquireTransactionLock(
      tx,
      `journal:${input.companyId}`,
      `${input.referenceType}:${input.referenceId}`,
    );

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

  async createAssetPurchaseBillWithinTransaction(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      companyId: string;
      branchId: string | null;
      supplierId: string;
      assetId: string;
      invoiceNumber?: string | null;
      description: string;
      amount: number;
      dueAt?: Date | null;
    },
  ) {
    const amount = this.round(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Demirbaş alım faturası tutarı sıfırdan büyük olmalıdır.');
    }

    await this.acquireTransactionLock(
      tx,
      `supplier-bill-source:${input.companyId}`,
      `ASSET_PURCHASE:${input.assetId}`,
    );

    const existing = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM supplier_bills
       WHERE company_id=$1::text AND source_type='ASSET_PURCHASE' AND source_id=$2::text
       LIMIT 1`,
      input.companyId,
      input.assetId,
    );
    if (existing[0]) return { id: existing[0].id, idempotent: true };

    const suppliers = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM inventory_suppliers
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND status='ACTIVE'
       LIMIT 1`,
      input.supplierId,
      input.tenantId,
      input.companyId,
    );
    if (!suppliers.length) throw new NotFoundException('Tedarikçi bulunamadı.');

    const billId = randomUUID();
    await tx.$executeRawUnsafe(
      `INSERT INTO supplier_bills(
         id,tenant_id,company_id,branch_id,supplier_id,invoice_number,description,
         amount,net_amount,tax_amount,due_at,source_type,source_id
       ) VALUES(
         $1::text,$2::text,$3::text,$4::text,$5::text,$6,$7,
         $8,$8,0,$9,'ASSET_PURCHASE',$10::text
       )`,
      billId,
      input.tenantId,
      input.companyId,
      input.branchId,
      input.supplierId,
      input.invoiceNumber?.trim() || null,
      input.description.trim(),
      amount,
      input.dueAt ?? null,
      input.assetId,
    );

    const fixedAsset = await this.ensureAccount(
      tx,
      input.tenantId,
      input.companyId,
      '255',
      'Demirbaşlar',
      'ASSET',
    );
    const payable = await this.ensureAccount(
      tx,
      input.tenantId,
      input.companyId,
      '320',
      'Satıcılar',
      'LIABILITY',
    );

    await this.postJournal(tx, {
      tenantId: input.tenantId,
      companyId: input.companyId,
      branchId: input.branchId,
      referenceType: 'SUPPLIER_BILL',
      referenceId: billId,
      description: `Demirbaş alım faturası ${input.invoiceNumber?.trim() || billId}`,
      entryDate: new Date(),
      debitAccountId: fixedAsset.id,
      creditAccountId: payable.id,
      amount,
    });

    return { id: billId, idempotent: false };
  }

  async createInventoryPurchaseBillWithinTransaction(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      companyId: string;
      branchId: string | null;
      supplierId: string;
      purchaseOrderId: string;
      invoiceNumber?: string | null;
      description: string;
      amount: number;
      taxAmount?: number;
      dueAt?: Date | null;
      actorId: string;
    },
  ) {
    const netAmount = this.round(input.amount);
    const taxAmount = this.round(input.taxAmount ?? 0);
    const grossAmount = this.round(netAmount + taxAmount);
    if (!Number.isFinite(netAmount) || netAmount <= 0) {
      throw new BadRequestException('Stok alım faturası net tutarı sıfırdan büyük olmalıdır.');
    }
    if (!Number.isFinite(taxAmount) || taxAmount < 0) {
      throw new BadRequestException('Stok alım faturası KDV tutarı negatif olamaz.');
    }

    await this.acquireTransactionLock(
      tx,
      `supplier-bill-source:${input.companyId}`,
      `INVENTORY_PURCHASE_ORDER:${input.purchaseOrderId}`,
    );

    const existing = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM supplier_bills
       WHERE company_id=$1::text AND source_type='INVENTORY_PURCHASE_ORDER' AND source_id=$2::text
       LIMIT 1`,
      input.companyId,
      input.purchaseOrderId,
    );
    if (existing[0]) return { id: existing[0].id, idempotent: true };

    const suppliers = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM inventory_suppliers
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND status='ACTIVE'
       LIMIT 1`,
      input.supplierId,
      input.tenantId,
      input.companyId,
    );
    if (!suppliers.length) throw new NotFoundException('Tedarikçi bulunamadı.');

    const billId = randomUUID();
    await tx.$executeRawUnsafe(
      `INSERT INTO supplier_bills(
         id,tenant_id,company_id,branch_id,supplier_id,invoice_number,description,
         amount,net_amount,tax_amount,due_at,source_type,source_id
       ) VALUES(
         $1::text,$2::text,$3::text,$4::text,$5::text,$6,$7,
         $8,$9,$10,$11,'INVENTORY_PURCHASE_ORDER',$12::text
       )`,
      billId,
      input.tenantId,
      input.companyId,
      input.branchId,
      input.supplierId,
      input.invoiceNumber?.trim() || null,
      input.description.trim(),
      grossAmount,
      netAmount,
      taxAmount,
      input.dueAt ?? null,
      input.purchaseOrderId,
    );

    const inventory = await this.ensureAccount(
      tx,
      input.tenantId,
      input.companyId,
      '150',
      'İlk Madde ve Malzeme',
      'ASSET',
    );
    const deductibleVat = taxAmount > 0
      ? await this.ensureAccount(
          tx,
          input.tenantId,
          input.companyId,
          '191',
          'İndirilecek KDV',
          'ASSET',
        )
      : null;
    const payable = await this.ensureAccount(
      tx,
      input.tenantId,
      input.companyId,
      '320',
      'Satıcılar',
      'LIABILITY',
    );

    const occurredAt = new Date();
    await this.acquireTransactionLock(
      tx,
      `journal:${input.companyId}`,
      `SUPPLIER_BILL:${billId}`,
    );
    const existingJournal = await tx.journalEntry.findFirst({
      where: {
        companyId: input.companyId,
        referenceType: 'SUPPLIER_BILL',
        referenceId: billId,
      },
      select: { id: true },
    });
    if (!existingJournal) {
      await tx.journalEntry.create({
        data: {
          tenantId: input.tenantId,
          companyId: input.companyId,
          branchId: input.branchId,
          number: this.journalNumber(occurredAt),
          status: 'POSTED',
          entryDate: occurredAt,
          description: `Stok alım faturası ${input.invoiceNumber?.trim() || billId}`,
          referenceType: 'SUPPLIER_BILL',
          referenceId: billId,
          postedAt: new Date(),
          lines: {
            create: [
              { accountId: inventory.id, debit: netAmount, credit: 0, memo: 'Stok alım matrahı' },
              ...(deductibleVat
                ? [{ accountId: deductibleVat.id, debit: taxAmount, credit: 0, memo: 'İndirilecek KDV' }]
                : []),
              { accountId: payable.id, debit: 0, credit: grossAmount, memo: 'Tedarikçi borcu' },
            ],
          },
        },
      });
    }

    return {
      id: billId,
      netAmount,
      taxAmount,
      amount: grossAmount,
      idempotent: false,
    };
  }

  async cancelInventoryPurchaseBillWithinTransaction(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      companyId: string;
      branchId: string | null;
      purchaseOrderId: string;
      reason: string;
    },
  ) {
    const reason = input.reason.trim();
    if (!reason) throw new BadRequestException('İade nedeni zorunludur.');

    await this.acquireTransactionLock(
      tx,
      `supplier-bill-source:${input.companyId}`,
      `INVENTORY_PURCHASE_ORDER:${input.purchaseOrderId}`,
    );

    const bills = await tx.$queryRawUnsafe<any[]>(
      `SELECT b.id,b.amount,b.net_amount AS "netAmount",b.tax_amount AS "taxAmount",b.status,
              COALESCE((SELECT SUM(p.amount) FROM supplier_bill_payments p WHERE p.supplier_bill_id=b.id),0)::numeric AS paid
       FROM supplier_bills b
       WHERE b.company_id=$1::text
         AND b.source_type='INVENTORY_PURCHASE_ORDER'
         AND b.source_id=$2::text
       FOR UPDATE`,
      input.companyId,
      input.purchaseOrderId,
    );
    if (!bills.length) {
      throw new NotFoundException('Satın alma siparişine bağlı tedarikçi faturası bulunamadı.');
    }
    const bill = bills[0];
    if (bill.status === 'CANCELLED') {
      return { id: bill.id, status: 'CANCELLED', idempotent: true };
    }
    if (Math.abs(Number(bill.paid ?? 0)) > 0.01) {
      throw new BadRequestException(
        'Ödemesi bulunan stok alım faturası, ödeme ters kaydı tamamlanmadan iade edilemez.',
      );
    }

    const originalJournal = await tx.journalEntry.findFirst({
      where: {
        companyId: input.companyId,
        referenceType: 'SUPPLIER_BILL',
        referenceId: bill.id,
      },
      include: { lines: true },
    });
    const originalDebitLines =
      originalJournal?.lines.filter((line) => Number(line.debit) > 0) ?? [];
    if (!originalJournal || originalDebitLines.length === 0) {
      throw new BadRequestException(
        'Stok alım faturasının özgün muhasebe kaydı bulunamadı.',
      );
    }

    const payable = await this.ensureAccount(
      tx,
      input.tenantId,
      input.companyId,
      '320',
      'Satıcılar',
      'LIABILITY',
    );
    const reversalDate = new Date();
    await this.acquireTransactionLock(
      tx,
      `journal:${input.companyId}`,
      `INVENTORY_PURCHASE_RETURN:${input.purchaseOrderId}`,
    );
    const existingReversal = await tx.journalEntry.findFirst({
      where: {
        companyId: input.companyId,
        referenceType: 'INVENTORY_PURCHASE_RETURN',
        referenceId: input.purchaseOrderId,
      },
      select: { id: true },
    });
    if (!existingReversal) {
      await tx.journalEntry.create({
        data: {
          tenantId: input.tenantId,
          companyId: input.companyId,
          branchId: input.branchId,
          number: this.journalNumber(reversalDate),
          status: 'POSTED',
          entryDate: reversalDate,
          description: `Stok alım iadesi ${input.purchaseOrderId}`,
          referenceType: 'INVENTORY_PURCHASE_RETURN',
          referenceId: input.purchaseOrderId,
          postedAt: reversalDate,
          lines: {
            create: [
              {
                accountId: payable.id,
                debit: Number(bill.amount),
                credit: 0,
                memo: 'Tedarikçi borcu ters kaydı',
              },
              ...originalDebitLines.map((line) => ({
                accountId: line.accountId,
                debit: 0,
                credit: Number(line.debit),
                memo: 'Satın alma iadesi',
              })),
            ],
          },
        },
      });
    }

    const updated = await tx.$executeRawUnsafe(
      `UPDATE supplier_bills
       SET status='CANCELLED',cancelled_at=NOW(),cancel_reason=$2,updated_at=NOW()
       WHERE id=$1::text AND status<>'CANCELLED'`,
      bill.id,
      reason,
    );
    if (updated !== 1) {
      throw new BadRequestException(
        'Stok alım faturası eşzamanlı olarak değiştirildi. Lütfen ekranı yenileyin.',
      );
    }

    return { id: bill.id, status: 'CANCELLED', idempotent: false };
  }

  async createBill(input: CreateBillInput) {
    const { tenantId, companyId, branchId } = this.context();
    const amount = this.round(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Tedarikçi faturası tutarı sıfırdan büyük olmalıdır.');
    }
    if ((input.sourceType && !input.sourceId) || (!input.sourceType && input.sourceId)) {
      throw new BadRequestException('Tedarikçi faturası kaynak türü ve kaynak kaydı birlikte gönderilmelidir.');
    }

    return this.prisma.$transaction(
      async (tx) => {
        const suppliers = await tx.$queryRawUnsafe<
          Array<{ id: string; name: string }>
        >(
          `SELECT id,name FROM inventory_suppliers WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND status='ACTIVE' LIMIT 1`,
          input.supplierId,
          tenantId,
          companyId,
        );
        if (!suppliers.length) throw new NotFoundException('Tedarikçi bulunamadı.');

        if (input.sourceType && input.sourceId) {
          await this.acquireTransactionLock(
            tx,
            `supplier-bill-source:${companyId}`,
            `${input.sourceType}:${input.sourceId}`,
          );
          const existing = await tx.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM supplier_bills
             WHERE company_id=$1::text AND source_type=$2 AND source_id=$3::text LIMIT 1`,
            companyId,
            input.sourceType,
            input.sourceId,
          );
          if (existing.length) {
            return { id: existing[0].id, idempotent: true };
          }
        }

        const billId = randomUUID();
        const rows = await tx.$queryRawUnsafe<any[]>(
          `INSERT INTO supplier_bills(
             id,tenant_id,company_id,branch_id,supplier_id,invoice_number,description,
             amount,net_amount,tax_amount,due_at,source_type,source_id
           ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,$7,$8,$8,0,$9,$10,$11::text)
           RETURNING id,supplier_id AS "supplierId",invoice_number AS "invoiceNumber",description,amount,due_at AS "dueAt",status,
                     source_type AS "sourceType",source_id AS "sourceId",created_at AS "createdAt"`,
          billId,
          tenantId,
          companyId,
          branchId,
          input.supplierId,
          input.invoiceNumber?.trim() || null,
          input.description.trim(),
          amount,
          input.dueAt ?? null,
          input.sourceType ?? null,
          input.sourceId ?? null,
        );

        const expense = await this.ensureAccount(
          tx,
          tenantId,
          companyId,
          input.expenseAccountCode ?? '770',
          input.expenseAccountName ?? 'Genel Yönetim Giderleri',
          'EXPENSE',
        );
        const payable = await this.ensureAccount(
          tx,
          tenantId,
          companyId,
          '320',
          'Satıcılar',
          'LIABILITY',
        );
        const occurredAt = new Date();
        await this.postJournal(tx, {
          tenantId,
          companyId,
          branchId,
          referenceType: 'SUPPLIER_BILL',
          referenceId: billId,
          description: `Tedarikçi faturası ${input.invoiceNumber?.trim() || billId}`,
          entryDate: occurredAt,
          debitAccountId: expense.id,
          creditAccountId: payable.id,
          amount,
        });

        const actorId = await this.currentUserId(tx);
        await this.supplierExpenseSync.syncBillCreated(tx, {
          tenantId,
          companyId,
          branchId,
          billId,
          actorId,
          supplierName: suppliers[0].name,
          invoiceNumber: input.invoiceNumber?.trim() || null,
          description: input.description.trim(),
          amount,
          occurredAt,
          dueAt: input.dueAt ?? null,
          expenseAccountId: expense.id,
          payableAccountId: payable.id,
        });

        return { ...rows[0], idempotent: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async listBills(input: ListBillsInput) {
    const { companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT b.id,b.supplier_id AS "supplierId",s.name AS "supplierName",b.invoice_number AS "invoiceNumber",
              b.description,b.amount,b.due_at AS "dueAt",b.status,b.cancelled_at AS "cancelledAt",b.cancel_reason AS "cancelReason",
              b.source_type AS "sourceType",b.source_id AS "sourceId",b.created_at AS "createdAt",
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
              b.description,b.amount,b.due_at AS "dueAt",b.status,b.cancelled_at AS "cancelledAt",b.cancel_reason AS "cancelReason",
              b.source_type AS "sourceType",b.source_id AS "sourceId",b.created_at AS "createdAt",
              COALESCE((SELECT SUM(p.amount) FROM supplier_bill_payments p WHERE p.supplier_bill_id=b.id),0)::numeric AS paid,
              (b.amount-COALESCE((SELECT SUM(p.amount) FROM supplier_bill_payments p WHERE p.supplier_bill_id=b.id),0))::numeric AS balance
       FROM supplier_bills b JOIN inventory_suppliers s ON s.id=b.supplier_id
       WHERE b.id=$1::text AND b.company_id=$2::text AND ($3::text IS NULL OR b.branch_id=$3::text) LIMIT 1`,
      id,
      companyId,
      branchId,
    );
    if (!rows.length) throw new NotFoundException('Tedarikçi faturası bulunamadı.');

    const payments = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,amount,method,reference,note,paid_at AS "paidAt" FROM supplier_bill_payments
       WHERE supplier_bill_id=$1::text ORDER BY paid_at DESC`,
      id,
    );
    return { ...rows[0], payments };
  }

  async payBill(id: string, input: PayBillInput) {
    const { tenantId, companyId, branchId } = this.context();
    const amount = this.round(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Ödeme tutarı sıfırdan büyük olmalıdır.');
    }

    await this.prisma.$transaction(
      async (tx) => {
        const bills = await tx.$queryRawUnsafe<any[]>(
          `SELECT b.id,b.amount,b.status,b.description,b.invoice_number AS "invoiceNumber",
                  b.due_at AS "dueAt",b.source_type AS "sourceType",s.name AS "supplierName",
                  COALESCE((SELECT SUM(p.amount) FROM supplier_bill_payments p WHERE p.supplier_bill_id=b.id),0)::numeric AS paid
           FROM supplier_bills b
           JOIN inventory_suppliers s ON s.id=b.supplier_id
           WHERE b.id=$1::text AND b.company_id=$2::text AND ($3::text IS NULL OR b.branch_id=$3::text)
           FOR UPDATE`,
          id,
          companyId,
          branchId,
        );
        if (!bills.length) throw new NotFoundException('Tedarikçi faturası bulunamadı.');
        const bill = bills[0];
        if (bill.status === 'CANCELLED') {
          throw new BadRequestException('İptal edilmiş tedarikçi faturalarına ödeme yapılamaz.');
        }

        const remaining = this.round(Number(bill.amount) - Number(bill.paid));
        if (remaining <= 0) throw new BadRequestException('Tedarikçi faturası zaten tamamen ödenmiş.');
        if (amount > remaining) {
          throw new BadRequestException(
            `Ödeme kalan bakiyeyi aşıyor: ${remaining.toFixed(2)}.`,
          );
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

        const payable = await this.ensureAccount(
          tx,
          tenantId,
          companyId,
          '320',
          'Satıcılar',
          'LIABILITY',
        );
        const paymentAccount =
          input.method === 'CASH'
            ? await this.ensureAccount(tx, tenantId, companyId, '100', 'Kasa', 'ASSET')
            : await this.ensureAccount(tx, tenantId, companyId, '102', 'Bankalar', 'ASSET');

        const paidAt = new Date();
        const paymentJournal = await this.postJournal(tx, {
          tenantId,
          companyId,
          branchId,
          referenceType: 'SUPPLIER_BILL_PAYMENT',
          referenceId: paymentId,
          description: `Tedarikçi ödemesi ${id}`,
          entryDate: paidAt,
          debitAccountId: payable.id,
          creditAccountId: paymentAccount.id,
          amount,
        });

        const originalJournal = await tx.journalEntry.findFirst({
          where: {
            companyId,
            referenceType: 'SUPPLIER_BILL',
            referenceId: id,
          },
          include: { lines: { include: { account: true } } },
        });
        if (!['INVENTORY_PURCHASE_ORDER', 'ASSET_PURCHASE'].includes(bill.sourceType)) {
          const expenseAccountId =
            originalJournal?.lines.find(
              (line) => Number(line.debit) > 0 && line.account.type === 'EXPENSE',
            )?.accountId ??
            (
              await this.ensureAccount(
                tx,
                tenantId,
                companyId,
                '770',
                'Genel Yönetim Giderleri',
                'EXPENSE',
              )
            ).id;
          const actorId = await this.currentUserId(tx);
          await this.supplierExpenseSync.syncBillPayment(tx, {
            tenantId,
            companyId,
            branchId,
            billId: id,
            actorId,
            supplierName: bill.supplierName,
            invoiceNumber: bill.invoiceNumber,
            description: bill.description,
            amount,
            occurredAt: paidAt,
            dueAt: bill.dueAt,
            expenseAccountId,
            payableAccountId: payable.id,
            paymentId,
            paymentJournalId: paymentJournal.id,
            paymentAccountId: paymentAccount.id,
            method: input.method,
            reference: input.reference?.trim() || null,
            note: input.note?.trim() || null,
            paidAt,
          });
        }

        const after = this.round(remaining - amount);
        await tx.$executeRawUnsafe(
          `UPDATE supplier_bills SET status=$2::"SupplierBillStatus",updated_at=NOW() WHERE id=$1::text`,
          id,
          after <= 0 ? 'PAID' : 'PARTIALLY_PAID',
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return this.getBill(id);
  }

  async cancelBill(id: string, input: CancelBillInput) {
    const { tenantId, companyId, branchId } = this.context();
    const reason = input.reason.trim();
    if (!reason) throw new BadRequestException('İptal nedeni zorunludur.');

    await this.prisma.$transaction(
      async (tx) => {
        const bills = await tx.$queryRawUnsafe<any[]>(
          `SELECT b.id,b.amount,b.status,b.invoice_number AS "invoiceNumber",
                  b.source_type AS "sourceType",
                  COALESCE((SELECT SUM(p.amount) FROM supplier_bill_payments p WHERE p.supplier_bill_id=b.id),0)::numeric AS paid
           FROM supplier_bills b
           WHERE b.id=$1::text AND b.company_id=$2::text AND ($3::text IS NULL OR b.branch_id=$3::text)
           FOR UPDATE`,
          id,
          companyId,
          branchId,
        );
        if (!bills.length) throw new NotFoundException('Tedarikçi faturası bulunamadı.');
        const bill = bills[0];
        if (bill.status === 'CANCELLED') {
          throw new BadRequestException('Tedarikçi faturası zaten iptal edilmiş.');
        }
        if (Number(bill.paid) > 0) {
          throw new BadRequestException(
            'Ödeme kaydı bulunan tedarikçi faturası, ödemeler ters kayıtla geri alınmadan iptal edilemez.',
          );
        }

        const updated = await tx.$executeRawUnsafe(
          `UPDATE supplier_bills
           SET status='CANCELLED',cancelled_at=NOW(),cancel_reason=$2,updated_at=NOW()
           WHERE id=$1::text AND status<>'CANCELLED'`,
          id,
          reason,
        );
        if (updated !== 1) {
          throw new BadRequestException('Tedarikçi faturası artık iptal edilebilir durumda değil.');
        }

        const originalJournal = await tx.journalEntry.findFirst({
          where: { companyId, referenceType: 'SUPPLIER_BILL', referenceId: id },
          include: { lines: { include: { account: true } } },
        });
        const originalDebitLine = originalJournal?.lines.find(
          (line) => Number(line.debit) > 0,
        );
        const debitAccount = originalDebitLine
          ? { id: originalDebitLine.accountId }
          : await this.ensureAccount(
              tx,
              tenantId,
              companyId,
              '770',
              'Genel Yönetim Giderleri',
              'EXPENSE',
            );
        const payable = await this.ensureAccount(
          tx,
          tenantId,
          companyId,
          '320',
          'Satıcılar',
          'LIABILITY',
        );
        await this.postJournal(tx, {
          tenantId,
          companyId,
          branchId,
          referenceType: 'SUPPLIER_BILL_CANCELLATION',
          referenceId: id,
          description: `Tedarikçi faturası iptali ${bill.invoiceNumber || id}`,
          entryDate: new Date(),
          debitAccountId: payable.id,
          creditAccountId: debitAccount.id,
          amount: Number(bill.amount),
        });

        if (!['INVENTORY_PURCHASE_ORDER', 'ASSET_PURCHASE'].includes(bill.sourceType)) {
          const actorId = await this.currentUserId(tx);
          await this.supplierExpenseSync.syncBillCancelled(tx, {
            tenantId,
            companyId,
            branchId,
            billId: id,
            actorId,
            reason,
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return this.getBill(id);
  }

  async aging() {
    const { companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `WITH balances AS (
         SELECT b.id,b.supplier_id,b.due_at,b.amount,
                (b.amount-COALESCE(SUM(p.amount),0))::numeric AS balance
         FROM supplier_bills b
         LEFT JOIN supplier_bill_payments p ON p.supplier_bill_id=b.id
         WHERE b.company_id=$1::text
           AND ($2::text IS NULL OR b.branch_id=$2::text)
           AND b.status IN ('OPEN','PARTIALLY_PAID')
         GROUP BY b.id
       )
       SELECT
         COALESCE(SUM(balance) FILTER (WHERE due_at IS NULL OR due_at >= CURRENT_DATE),0)::numeric AS "notDue",
         COALESCE(SUM(balance) FILTER (WHERE due_at < CURRENT_DATE AND due_at >= CURRENT_DATE-INTERVAL '30 days'),0)::numeric AS "days0to30",
         COALESCE(SUM(balance) FILTER (WHERE due_at < CURRENT_DATE-INTERVAL '30 days' AND due_at >= CURRENT_DATE-INTERVAL '60 days'),0)::numeric AS "days31to60",
         COALESCE(SUM(balance) FILTER (WHERE due_at < CURRENT_DATE-INTERVAL '60 days' AND due_at >= CURRENT_DATE-INTERVAL '90 days'),0)::numeric AS "days61to90",
         COALESCE(SUM(balance) FILTER (WHERE due_at < CURRENT_DATE-INTERVAL '90 days'),0)::numeric AS "days90Plus",
         COALESCE(SUM(balance),0)::numeric AS total
       FROM balances`,
      companyId,
      branchId,
    );
    return rows[0] ?? {
      notDue: 0,
      days0to30: 0,
      days31to60: 0,
      days61to90: 0,
      days90Plus: 0,
      total: 0,
    };
  }

  async supplierLedger(supplierId: string) {
    const { companyId, branchId } = this.context();
    const supplier = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,name FROM inventory_suppliers WHERE id=$1::text AND company_id=$2::text LIMIT 1`,
      supplierId,
      companyId,
    );
    if (!supplier.length) throw new NotFoundException('Tedarikçi bulunamadı.');

    const entries = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM (
         SELECT b.id AS "referenceId",'BILL'::text AS type,b.created_at AS date,
                COALESCE(b.invoice_number,b.id) AS reference,b.description,
                b.amount::numeric AS debit,0::numeric AS credit
         FROM supplier_bills b
         WHERE b.supplier_id=$1::text AND b.company_id=$2::text
           AND ($3::text IS NULL OR b.branch_id=$3::text)

         UNION ALL

         SELECT p.id AS "referenceId",'PAYMENT'::text AS type,p.paid_at AS date,
                COALESCE(p.reference,p.id) AS reference,COALESCE(p.note,'Tedarikçi ödemesi') AS description,
                0::numeric AS debit,p.amount::numeric AS credit
         FROM supplier_bill_payments p
         JOIN supplier_bills b ON b.id=p.supplier_bill_id
         WHERE b.supplier_id=$1::text AND b.company_id=$2::text
           AND ($3::text IS NULL OR b.branch_id=$3::text)

         UNION ALL

         SELECT b.id AS "referenceId",'BILL_CANCELLATION'::text AS type,b.cancelled_at AS date,
                COALESCE(b.invoice_number,b.id) AS reference,COALESCE(b.cancel_reason,'Fatura iptali') AS description,
                0::numeric AS debit,b.amount::numeric AS credit
         FROM supplier_bills b
         WHERE b.supplier_id=$1::text AND b.company_id=$2::text
           AND ($3::text IS NULL OR b.branch_id=$3::text)
           AND b.status='CANCELLED' AND b.cancelled_at IS NOT NULL
       ) x
       ORDER BY date ASC,type ASC,"referenceId" ASC`,
      supplierId,
      companyId,
      branchId,
    );

    let runningBalance = 0;
    const ledger = entries.map((entry) => {
      const debit = Number(entry.debit);
      const credit = Number(entry.credit);
      runningBalance = this.round(runningBalance + debit - credit);
      return { ...entry, debit, credit, runningBalance };
    });

    return {
      supplier: supplier[0],
      totals: {
        debit: this.round(ledger.reduce((sum, entry) => sum + entry.debit, 0)),
        credit: this.round(ledger.reduce((sum, entry) => sum + entry.credit, 0)),
        balance: runningBalance,
      },
      entries: ledger,
    };
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
    return (
      rows[0] ?? {
        billCount: 0,
        totalBills: 0,
        paid: 0,
        outstanding: 0,
        overdueCount: 0,
      }
    );
  }
}
