import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@beauty-erp/database';

type SupplierExpenseContext = {
  tenantId: string;
  companyId: string;
  branchId: string | null;
  billId: string;
  actorId: string;
  supplierName?: string | null;
  invoiceNumber?: string | null;
  description: string;
  amount: number;
  occurredAt: Date;
  dueAt?: Date | null;
  expenseAccountId: string;
  payableAccountId: string;
};

type SupplierExpensePaymentContext = SupplierExpenseContext & {
  paymentId: string;
  paymentJournalId: string;
  paymentAccountId: string;
  method: 'CASH' | 'CARD' | 'TRANSFER';
  reference?: string | null;
  note?: string | null;
  paidAt: Date;
};

@Injectable()
export class SupplierExpenseSyncService {
  private async ensureCategory(
    tx: Prisma.TransactionClient,
    tenantId: string,
    companyId: string,
  ) {
    const existing = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM expense_categories
       WHERE tenant_id=$1::text AND company_id=$2::text AND code='AUTO_SUPPLIER_EXPENSE'
       LIMIT 1`,
      tenantId,
      companyId,
    );
    if (existing[0]) return existing[0].id;

    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO expense_categories(
         id,tenant_id,company_id,code,name,system,active,created_at,updated_at
       ) VALUES($1::text,$2::text,$3::text,'AUTO_SUPPLIER_EXPENSE','Tedarikçi Giderleri',true,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
       ON CONFLICT (tenant_id,company_id,code)
       DO UPDATE SET name='Tedarikçi Giderleri',system=true,active=true,updated_at=CURRENT_TIMESTAMP
       RETURNING id`,
      randomUUID(),
      tenantId,
      companyId,
    );
    return rows[0].id;
  }

  private async findExpense(
    tx: Prisma.TransactionClient,
    input: { tenantId: string; companyId: string; billId: string },
  ) {
    const rows = await tx.$queryRawUnsafe<
      Array<{ id: string; paymentStatus: string }>
    >(
      `SELECT id,payment_status::text AS "paymentStatus"
       FROM expenses
       WHERE tenant_id=$1::text AND company_id=$2::text
         AND source_type='SUPPLIER_BILL' AND source_id=$3
       ORDER BY created_at ASC
       LIMIT 1`,
      input.tenantId,
      input.companyId,
      input.billId,
    );
    return rows[0] ?? null;
  }

  async syncBillCreated(
    tx: Prisma.TransactionClient,
    input: SupplierExpenseContext,
  ) {
    const existing = await this.findExpense(tx, input);
    if (existing) return existing;

    const categoryId = await this.ensureCategory(
      tx,
      input.tenantId,
      input.companyId,
    );

    await tx.$executeRawUnsafe(
      `INSERT INTO expense_accounting_mappings(
         id,tenant_id,company_id,category_id,expense_account_id,tax_account_id,
         payable_account_id,withholding_account_id,active,created_at,updated_at
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,NULL,$6::text,NULL,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
       ON CONFLICT (company_id,category_id)
       DO UPDATE SET expense_account_id=EXCLUDED.expense_account_id,
                     payable_account_id=EXCLUDED.payable_account_id,
                     active=true,
                     updated_at=CURRENT_TIMESTAMP`,
      randomUUID(),
      input.tenantId,
      input.companyId,
      categoryId,
      input.expenseAccountId,
      input.payableAccountId,
    );

    const expenseId = randomUUID();
    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO expenses(
         id,tenant_id,company_id,branch_id,category_id,counterparty_name,
         document_type,document_number,document_date,transaction_date,due_date,
         gross_amount,net_amount,tax_amount,withholding_amount,currency,exchange_rate,
         description,approval_status,payment_status,reconciliation_status,
         accounting_status,source_type,source_id,version,created_by,created_at,updated_at
       )
       SELECT $1::text,$2::text,$3::text,$4::text,$5::text,$6,
              'TEDARIKCI_FATURASI',$7,$8,$8,$9,$10,$10,0,0,'TRY',1,$11,
              'APPROVED'::"FinanceApprovalStatus",'UNPAID'::"FinancePaymentStatus",
              'UNRECONCILED'::"FinanceReconciliationStatus",'POSTED'::"FinanceAccountingStatus",
              'SUPPLIER_BILL',$12,1,$13::text,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
       WHERE NOT EXISTS(
         SELECT 1 FROM expenses
         WHERE tenant_id=$2::text AND company_id=$3::text
           AND source_type='SUPPLIER_BILL' AND source_id=$12
       )
       RETURNING id`,
      expenseId,
      input.tenantId,
      input.companyId,
      input.branchId,
      categoryId,
      input.supplierName?.trim() || null,
      input.invoiceNumber?.trim() || null,
      input.occurredAt,
      input.dueAt ?? null,
      input.amount,
      input.description,
      input.billId,
      input.actorId,
    );

    const expense = rows[0] ?? (await this.findExpense(tx, input));
    if (!expense) throw new Error('Tedarikçi gider kaydı oluşturulamadı.');

    await tx.$executeRawUnsafe(
      `INSERT INTO expense_audit_events(
         id,tenant_id,company_id,branch_id,expense_id,actor_id,event_type,after_state,created_at
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,
                'EXPENSE_AUTO_CREATED_FROM_SUPPLIER_BILL',$7::jsonb,CURRENT_TIMESTAMP)`,
      randomUUID(),
      input.tenantId,
      input.companyId,
      input.branchId,
      expense.id,
      input.actorId,
      JSON.stringify({ billId: input.billId, amount: input.amount }),
    );

    return expense;
  }

  async syncBillPayment(
    tx: Prisma.TransactionClient,
    input: SupplierExpensePaymentContext,
  ) {
    let expense = await this.findExpense(tx, input);
    if (!expense) expense = await this.syncBillCreated(tx, input);

    const existing = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM expense_payments
       WHERE tenant_id=$1::text AND company_id=$2::text
         AND source_type='SUPPLIER_BILL_PAYMENT' AND source_id=$3
       LIMIT 1`,
      input.tenantId,
      input.companyId,
      input.paymentId,
    );
    if (existing[0]) return existing[0];

    const expensePaymentId = randomUUID();
    await tx.$executeRawUnsafe(
      `INSERT INTO expense_payments(
         id,tenant_id,company_id,branch_id,expense_id,payable_account_id,payment_account_id,
         journal_entry_id,amount,method,reference,note,paid_at,source_type,source_id,created_by,created_at
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text,
                $9,$10,$11,$12,$13,'SUPPLIER_BILL_PAYMENT',$14,$15::text,CURRENT_TIMESTAMP)`,
      expensePaymentId,
      input.tenantId,
      input.companyId,
      input.branchId,
      expense.id,
      input.payableAccountId,
      input.paymentAccountId,
      input.paymentJournalId,
      input.amount,
      input.method,
      input.reference?.trim() || null,
      input.note?.trim() || null,
      input.paidAt,
      input.paymentId,
      input.actorId,
    );

    await this.refreshPaymentStatus(tx, {
      tenantId: input.tenantId,
      companyId: input.companyId,
      expenseId: expense.id,
    });

    await tx.$executeRawUnsafe(
      `INSERT INTO expense_audit_events(
         id,tenant_id,company_id,branch_id,expense_id,actor_id,event_type,after_state,created_at
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,
                'EXPENSE_AUTO_PAYMENT_FROM_SUPPLIER_BILL',$7::jsonb,CURRENT_TIMESTAMP)`,
      randomUUID(),
      input.tenantId,
      input.companyId,
      input.branchId,
      expense.id,
      input.actorId,
      JSON.stringify({
        billId: input.billId,
        paymentId: input.paymentId,
        amount: input.amount,
      }),
    );

    return { id: expensePaymentId };
  }

  async syncBillPaymentReversal(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      companyId: string;
      branchId: string | null;
      billId: string;
      actorId: string;
      supplierPaymentId: string;
      reversalJournalId: string;
      reason: string;
    },
  ) {
    const expense = await this.findExpense(tx, input);
    if (!expense) return null;

    const paymentRows = await tx.$queryRawUnsafe<
      Array<{ id: string }>
    >(
      `SELECT id FROM expense_payments
       WHERE tenant_id=$1::text AND company_id=$2::text
         AND source_type='SUPPLIER_BILL_PAYMENT' AND source_id=$3
       LIMIT 1`,
      input.tenantId,
      input.companyId,
      input.supplierPaymentId,
    );
    const expensePayment = paymentRows[0];
    if (!expensePayment) return null;

    const existing = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM expense_payment_reversals
       WHERE expense_payment_id=$1::text
       LIMIT 1`,
      expensePayment.id,
    );
    if (existing[0]) return existing[0];

    const reversalId = randomUUID();
    await tx.$executeRawUnsafe(
      `INSERT INTO expense_payment_reversals(
         id,tenant_id,company_id,branch_id,expense_payment_id,journal_entry_id,
         reason,source_type,source_id,created_by,created_at
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,
                'SUPPLIER_BILL_PAYMENT_REVERSAL',$8,$9::text,CURRENT_TIMESTAMP)`,
      reversalId,
      input.tenantId,
      input.companyId,
      input.branchId,
      expensePayment.id,
      input.reversalJournalId,
      input.reason,
      input.supplierPaymentId,
      input.actorId,
    );

    await this.refreshPaymentStatus(tx, {
      tenantId: input.tenantId,
      companyId: input.companyId,
      expenseId: expense.id,
    });

    await tx.$executeRawUnsafe(
      `INSERT INTO expense_audit_events(
         id,tenant_id,company_id,branch_id,expense_id,actor_id,event_type,reason,
         after_state,created_at
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,
                'EXPENSE_AUTO_PAYMENT_REVERSED_FROM_SUPPLIER_BILL',$7,$8::jsonb,CURRENT_TIMESTAMP)`,
      randomUUID(),
      input.tenantId,
      input.companyId,
      input.branchId,
      expense.id,
      input.actorId,
      input.reason,
      JSON.stringify({
        billId: input.billId,
        supplierPaymentId: input.supplierPaymentId,
        reversed: true,
      }),
    );

    return { id: reversalId };
  }

  async syncBillCancelled(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      companyId: string;
      branchId: string | null;
      billId: string;
      actorId: string;
      reason: string;
    },
  ) {
    const expense = await this.findExpense(tx, input);
    if (!expense) return null;

    await tx.$executeRawUnsafe(
      `UPDATE expenses
       SET approval_status='CANCELLED'::"FinanceApprovalStatus",
           payment_status='CANCELLED'::"FinancePaymentStatus",
           accounting_status='REVERSED'::"FinanceAccountingStatus",
           version=version+1,
           updated_at=CURRENT_TIMESTAMP
       WHERE id=$1::text`,
      expense.id,
    );
    await tx.$executeRawUnsafe(
      `INSERT INTO expense_audit_events(
         id,tenant_id,company_id,branch_id,expense_id,actor_id,event_type,reason,after_state,created_at
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,
                'EXPENSE_AUTO_CANCELLED_FROM_SUPPLIER_BILL',$7,$8::jsonb,CURRENT_TIMESTAMP)`,
      randomUUID(),
      input.tenantId,
      input.companyId,
      input.branchId,
      expense.id,
      input.actorId,
      input.reason,
      JSON.stringify({ billId: input.billId, cancelled: true }),
    );
    return expense;
  }

  private async refreshPaymentStatus(
    tx: Prisma.TransactionClient,
    input: { tenantId: string; companyId: string; expenseId: string },
  ) {
    const rows = await tx.$queryRawUnsafe<
      Array<{ gross: Prisma.Decimal; paid: Prisma.Decimal }>
    >(
      `SELECT e.gross_amount AS gross,
              COALESCE(SUM(CASE WHEN r.id IS NULL THEN p.amount ELSE 0 END),0) AS paid
       FROM expenses e
       LEFT JOIN expense_payments p ON p.expense_id=e.id
       LEFT JOIN expense_payment_reversals r ON r.expense_payment_id=p.id
       WHERE e.id=$1::text AND e.tenant_id=$2::text AND e.company_id=$3::text
       GROUP BY e.gross_amount`,
      input.expenseId,
      input.tenantId,
      input.companyId,
    );
    const gross = Number(rows[0]?.gross ?? 0);
    const paid = Number(rows[0]?.paid ?? 0);
    const status =
      paid <= 0.01
        ? 'UNPAID'
        : Math.abs(gross - paid) <= 0.01
          ? 'PAID'
          : 'PARTIALLY_PAID';
    await tx.$executeRawUnsafe(
      `UPDATE expenses
       SET payment_status=$1::"FinancePaymentStatus",version=version+1,updated_at=CURRENT_TIMESTAMP
       WHERE id=$2::text`,
      status,
      input.expenseId,
    );
    return status;
  }
}
