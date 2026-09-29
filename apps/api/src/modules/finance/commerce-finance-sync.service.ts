import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@beauty-erp/database';

type SaleFinanceContext = {
  tenantId: string;
  companyId: string;
  branchId: string;
  saleId: string;
  actorId: string;
  customerName?: string | null;
  amount: number;
  occurredAt: Date;
};

type PaymentFinanceContext = SaleFinanceContext & {
  paymentId: string;
  method: 'CASH' | 'CARD' | 'TRANSFER';
  reference?: string | null;
  note?: string | null;
};

type AppointmentFinanceContext = {
  tenantId: string;
  companyId: string;
  branchId: string;
  appointmentId: string;
  actorId: string;
  customerName?: string | null;
  serviceName?: string | null;
  amount: number;
  occurredAt: Date;
  dueAt?: Date | null;
};

type AppointmentPaymentFinanceContext = AppointmentFinanceContext & {
  paymentId: string;
  method: 'CASH' | 'CARD' | 'TRANSFER';
};

@Injectable()
export class CommerceFinanceSyncService {
  private async companyBaseCurrency(
    tx: Prisma.TransactionClient,
    tenantId: string,
    companyId: string,
  ) {
    const company = await tx.company.findFirst({
      where: { id: companyId, tenantId },
      select: { baseCurrency: true },
    });
    return company?.baseCurrency ?? 'TRY';
  }

  private async ensureSalesCategory(
    tx: Prisma.TransactionClient,
    tenantId: string,
    companyId: string,
  ) {
    const existing = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM income_categories
       WHERE tenant_id=$1::text AND company_id=$2::text AND code='AUTO_SALES'
       LIMIT 1`,
      tenantId,
      companyId,
    );
    if (existing[0]) return existing[0].id;

    const id = randomUUID();
    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO income_categories(
         id,tenant_id,company_id,code,name,system,active,created_at,updated_at
       ) VALUES($1::text,$2::text,$3::text,'AUTO_SALES','Satış Gelirleri',true,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
       ON CONFLICT (tenant_id,company_id,code)
       DO UPDATE SET active=true,system=true,name='Satış Gelirleri',updated_at=CURRENT_TIMESTAMP
       RETURNING id`,
      id,
      tenantId,
      companyId,
    );
    return rows[0].id;
  }

  private async ensureIncomeAccountingMapping(
    tx: Prisma.TransactionClient,
    input: { tenantId: string; companyId: string; categoryId: string },
  ) {
    const accounts = await tx.chartOfAccount.findMany({
      where: {
        tenantId: input.tenantId,
        companyId: input.companyId,
        code: { in: ['120', '600'] },
        active: true,
      },
      select: { id: true, code: true },
    });
    const receivable = accounts.find((account) => account.code === '120');
    const revenue = accounts.find((account) => account.code === '600');
    if (!receivable || !revenue) {
      throw new Error('Satış gelir senkronizasyonu için 120 ve 600 hesapları bulunamadı.');
    }

    await tx.$executeRawUnsafe(
      `INSERT INTO income_accounting_mappings(
         id,tenant_id,company_id,category_id,revenue_account_id,tax_account_id,receivable_account_id,active,created_at,updated_at
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,NULL,$6::text,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
       ON CONFLICT (company_id,category_id)
       DO UPDATE SET revenue_account_id=EXCLUDED.revenue_account_id,
                     receivable_account_id=EXCLUDED.receivable_account_id,
                     active=true,
                     updated_at=CURRENT_TIMESTAMP`,
      randomUUID(),
      input.tenantId,
      input.companyId,
      input.categoryId,
      revenue.id,
      receivable.id,
    );
  }

  private async findIncomeRecord(
    tx: Prisma.TransactionClient,
    input: { tenantId: string; companyId: string; saleId: string },
  ) {
    const rows = await tx.$queryRawUnsafe<
      Array<{ id: string; grossAmount: Prisma.Decimal; collectionStatus: string }>
    >(
      `SELECT id,gross_amount AS "grossAmount",collection_status::text AS "collectionStatus"
       FROM income_records
       WHERE tenant_id=$1::text AND company_id=$2::text
         AND source_type='SALE' AND source_id=$3
       ORDER BY created_at ASC
       LIMIT 1`,
      input.tenantId,
      input.companyId,
      input.saleId,
    );
    return rows[0] ?? null;
  }

  async syncSaleConfirmed(tx: Prisma.TransactionClient, input: SaleFinanceContext) {
    const existing = await this.findIncomeRecord(tx, input);
    if (existing) return existing;

    const categoryId = await this.ensureSalesCategory(tx, input.tenantId, input.companyId);
    await this.ensureIncomeAccountingMapping(tx, {
      tenantId: input.tenantId,
      companyId: input.companyId,
      categoryId,
    });

    const baseCurrency = await this.companyBaseCurrency(tx, input.tenantId, input.companyId);
    const incomeId = randomUUID();
    const rows = await tx.$queryRawUnsafe<
      Array<{ id: string; grossAmount: Prisma.Decimal; collectionStatus: string }>
    >(
      `INSERT INTO income_records(
         id,tenant_id,company_id,branch_id,category_id,counterparty_name,document_type,document_number,
         transaction_date,due_date,gross_amount,net_amount,tax_amount,currency,exchange_rate,description,
         approval_status,collection_status,reconciliation_status,accounting_status,source_type,source_id,
         version,created_by,created_at,updated_at
       )
       SELECT $1::text,$2::text,$3::text,$4::text,$5::text,$6,'SATIS',$7,$8,$8,$9,$9,0,$10,1,$11,
              'APPROVED'::"FinanceApprovalStatus",'UNCOLLECTED'::"IncomeCollectionStatus",
              'UNRECONCILED'::"FinanceReconciliationStatus",'POSTED'::"FinanceAccountingStatus",
              'SALE',$12,1,$13::text,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
       WHERE NOT EXISTS(
         SELECT 1 FROM income_records
          WHERE tenant_id=$2::text AND company_id=$3::text AND source_type='SALE' AND source_id=$12
       )
       RETURNING id,gross_amount AS "grossAmount",collection_status::text AS "collectionStatus"`,
      incomeId,
      input.tenantId,
      input.companyId,
      input.branchId,
      categoryId,
      input.customerName?.trim() || null,
      input.saleId,
      input.occurredAt,
      input.amount,
      baseCurrency,
      `Satış kaydı ${input.saleId}`,
      input.saleId,
      input.actorId,
    );

    const record = rows[0] ?? (await this.findIncomeRecord(tx, input));
    if (!record) throw new Error('Satış gelir kaydı oluşturulamadı.');

    await tx.$executeRawUnsafe(
      `INSERT INTO income_audit_events(
         id,tenant_id,company_id,branch_id,income_record_id,actor_id,event_type,after_state,created_at
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,'INCOME_AUTO_CREATED_FROM_SALE',$7::jsonb,CURRENT_TIMESTAMP)`,
      randomUUID(),
      input.tenantId,
      input.companyId,
      input.branchId,
      record.id,
      input.actorId,
      JSON.stringify({ saleId: input.saleId, amount: input.amount }),
    );

    return record;
  }

  async syncSalePayment(tx: Prisma.TransactionClient, input: PaymentFinanceContext) {
    let income = await this.findIncomeRecord(tx, input);
    if (!income) {
      income = await this.syncSaleConfirmed(tx, input);
    }

    const existing = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM income_collections
       WHERE tenant_id=$1::text AND company_id=$2::text
         AND source_type='SALE_PAYMENT' AND source_id=$3
       LIMIT 1`,
      input.tenantId,
      input.companyId,
      input.paymentId,
    );
    if (existing[0]) return existing[0];

    const accountCode = input.method === 'CASH' ? '100' : input.method === 'CARD' ? '108' : '102';
    const account = await tx.chartOfAccount.findFirst({
      where: {
        tenantId: input.tenantId,
        companyId: input.companyId,
        code: accountCode,
        active: true,
      },
      select: { id: true },
    });
    if (!account) {
      throw new Error(`Tahsilat hesabı bulunamadı: ${accountCode}.`);
    }

    const collectionId = randomUUID();
    await tx.$executeRawUnsafe(
      `INSERT INTO income_collections(
         id,tenant_id,company_id,branch_id,income_record_id,collection_account_id,amount,method,
         reference,note,collected_at,source_type,source_id,created_by,created_at
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8,$9,$10,$11,'SALE_PAYMENT',$12,$13::text,CURRENT_TIMESTAMP)`,
      collectionId,
      input.tenantId,
      input.companyId,
      input.branchId,
      income.id,
      account.id,
      input.amount,
      input.method,
      input.reference?.trim() || null,
      input.note?.trim() || null,
      input.occurredAt,
      input.paymentId,
      input.actorId,
    );

    await this.refreshCollectionStatus(tx, {
      tenantId: input.tenantId,
      companyId: input.companyId,
      incomeId: income.id,
    });

    await tx.$executeRawUnsafe(
      `INSERT INTO income_audit_events(
         id,tenant_id,company_id,branch_id,income_record_id,actor_id,event_type,after_state,created_at
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,'INCOME_AUTO_COLLECTION_FROM_SALE',$7::jsonb,CURRENT_TIMESTAMP)`,
      randomUUID(),
      input.tenantId,
      input.companyId,
      input.branchId,
      income.id,
      input.actorId,
      JSON.stringify({ saleId: input.saleId, paymentId: input.paymentId, amount: input.amount, method: input.method }),
    );

    return { id: collectionId };
  }

  async syncSalePaymentRefund(
    tx: Prisma.TransactionClient,
    input: PaymentFinanceContext & { reason: string },
  ) {
    const income = await this.findIncomeRecord(tx, input);
    if (!income) return null;

    const collectionRows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT c.id
       FROM income_collections c
       WHERE c.tenant_id=$1::text AND c.company_id=$2::text
         AND c.source_type='SALE_PAYMENT' AND c.source_id=$3
       LIMIT 1`,
      input.tenantId,
      input.companyId,
      input.paymentId,
    );
    const collection = collectionRows[0];
    if (!collection) return null;

    const existing = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM income_collection_reversals
       WHERE tenant_id=$1::text AND company_id=$2::text
         AND source_type='SALE_PAYMENT_REFUND' AND source_id=$3
       LIMIT 1`,
      input.tenantId,
      input.companyId,
      input.paymentId,
    );
    if (existing[0]) return existing[0];

    const refundJournal = await tx.journalEntry.findFirst({
      where: {
        companyId: input.companyId,
        referenceType: 'SALE_PAYMENT_REFUND',
        referenceId: input.paymentId,
      },
      select: { id: true },
    });
    if (!refundJournal) {
      throw new Error('Satış iadesi muhasebe fişi bulunamadı.');
    }

    const reversalId = randomUUID();
    await tx.$executeRawUnsafe(
      `INSERT INTO income_collection_reversals(
         id,tenant_id,company_id,branch_id,income_collection_id,journal_entry_id,reason,
         source_type,source_id,created_by,created_at
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,'SALE_PAYMENT_REFUND',$8,$9::text,CURRENT_TIMESTAMP)`,
      reversalId,
      input.tenantId,
      input.companyId,
      input.branchId,
      collection.id,
      refundJournal.id,
      input.amount,
      input.reason,
      input.paymentId,
      input.actorId,
    );

    await this.refreshCollectionStatus(tx, {
      tenantId: input.tenantId,
      companyId: input.companyId,
      incomeId: income.id,
    });

    await tx.$executeRawUnsafe(
      `INSERT INTO income_audit_events(
         id,tenant_id,company_id,branch_id,income_record_id,actor_id,event_type,reason,after_state,created_at
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,'INCOME_AUTO_COLLECTION_REFUNDED',$7,$8::jsonb,CURRENT_TIMESTAMP)`,
      randomUUID(),
      input.tenantId,
      input.companyId,
      input.branchId,
      income.id,
      input.actorId,
      input.reason,
      JSON.stringify({ saleId: input.saleId, paymentId: input.paymentId, amount: input.amount }),
    );

    return { id: reversalId };
  }

  private async findAppointmentIncomeRecord(
    tx: Prisma.TransactionClient,
    input: { tenantId: string; companyId: string; appointmentId: string },
  ) {
    const rows = await tx.$queryRawUnsafe<
      Array<{ id: string; grossAmount: Prisma.Decimal; collectionStatus: string }>
    >(
      `SELECT id,gross_amount AS "grossAmount",collection_status::text AS "collectionStatus"
       FROM income_records
       WHERE tenant_id=$1::text AND company_id=$2::text
         AND source_type='APPOINTMENT' AND source_id=$3
       ORDER BY created_at ASC
       LIMIT 1`,
      input.tenantId,
      input.companyId,
      input.appointmentId,
    );
    return rows[0] ?? null;
  }

  async syncAppointmentReceivable(
    tx: Prisma.TransactionClient,
    input: AppointmentFinanceContext,
  ) {
    const existing = await this.findAppointmentIncomeRecord(tx, input);
    if (existing) return existing;

    const categoryId = await this.ensureSalesCategory(
      tx,
      input.tenantId,
      input.companyId,
    );
    await this.ensureIncomeAccountingMapping(tx, {
      tenantId: input.tenantId,
      companyId: input.companyId,
      categoryId,
    });

    const baseCurrency = await this.companyBaseCurrency(tx, input.tenantId, input.companyId);
    const incomeId = randomUUID();
    const description = input.serviceName?.trim()
      ? `Randevu hizmet geliri · ${input.serviceName}`
      : `Randevu hizmet geliri ${input.appointmentId}`;

    const rows = await tx.$queryRawUnsafe<
      Array<{ id: string; grossAmount: Prisma.Decimal; collectionStatus: string }>
    >(
      `INSERT INTO income_records(
         id,tenant_id,company_id,branch_id,category_id,counterparty_name,document_type,document_number,
         transaction_date,due_date,gross_amount,net_amount,tax_amount,currency,exchange_rate,description,
         approval_status,collection_status,reconciliation_status,accounting_status,source_type,source_id,
         version,created_by,created_at,updated_at
       )
       SELECT $1::text,$2::text,$3::text,$4::text,$5::text,$6,'RANDEVU',$7,$8,$9,$10,$10,0,$11,1,$12,
              'APPROVED'::"FinanceApprovalStatus",'UNCOLLECTED'::"IncomeCollectionStatus",
              'UNRECONCILED'::"FinanceReconciliationStatus",'POSTED'::"FinanceAccountingStatus",
              'APPOINTMENT',$13,1,$14::text,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
       WHERE NOT EXISTS(
         SELECT 1 FROM income_records
          WHERE tenant_id=$2::text AND company_id=$3::text
            AND source_type='APPOINTMENT' AND source_id=$13
       )
       RETURNING id,gross_amount AS "grossAmount",collection_status::text AS "collectionStatus"`,
      incomeId,
      input.tenantId,
      input.companyId,
      input.branchId,
      categoryId,
      input.customerName?.trim() || null,
      input.appointmentId,
      input.occurredAt,
      input.dueAt ?? input.occurredAt,
      input.amount,
      baseCurrency,
      description,
      input.appointmentId,
      input.actorId,
    );

    const record =
      rows[0] ?? (await this.findAppointmentIncomeRecord(tx, input));
    if (!record) {
      throw new Error('Randevu gelir kaydı oluşturulamadı.');
    }

    await tx.$executeRawUnsafe(
      `INSERT INTO income_audit_events(
         id,tenant_id,company_id,branch_id,income_record_id,actor_id,event_type,after_state,created_at
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,
                'INCOME_AUTO_CREATED_FROM_APPOINTMENT',$7::jsonb,CURRENT_TIMESTAMP)`,
      randomUUID(),
      input.tenantId,
      input.companyId,
      input.branchId,
      record.id,
      input.actorId,
      JSON.stringify({
        appointmentId: input.appointmentId,
        amount: input.amount,
      }),
    );

    return record;
  }

  async syncAppointmentPayment(
    tx: Prisma.TransactionClient,
    input: AppointmentPaymentFinanceContext,
  ) {
    let income = await this.findAppointmentIncomeRecord(tx, input);
    if (!income) {
      income = await this.syncAppointmentReceivable(tx, input);
    }

    const existing = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM income_collections
       WHERE tenant_id=$1::text AND company_id=$2::text
         AND source_type='APPOINTMENT_PAYMENT' AND source_id=$3
       LIMIT 1`,
      input.tenantId,
      input.companyId,
      input.paymentId,
    );
    if (existing[0]) return existing[0];

    const accountCode =
      input.method === 'CASH' ? '100' : input.method === 'CARD' ? '108' : '102';
    const account = await tx.chartOfAccount.findFirst({
      where: {
        tenantId: input.tenantId,
        companyId: input.companyId,
        code: accountCode,
        active: true,
      },
      select: { id: true },
    });
    if (!account) {
      throw new Error(`Tahsilat hesabı bulunamadı: ${accountCode}.`);
    }

    const collectionId = randomUUID();
    await tx.$executeRawUnsafe(
      `INSERT INTO income_collections(
         id,tenant_id,company_id,branch_id,income_record_id,collection_account_id,amount,method,
         reference,note,collected_at,source_type,source_id,created_by,created_at
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8,NULL,$9,$10,
                'APPOINTMENT_PAYMENT',$11,$12::text,CURRENT_TIMESTAMP)`,
      collectionId,
      input.tenantId,
      input.companyId,
      input.branchId,
      income.id,
      account.id,
      input.amount,
      input.method,
      input.serviceName?.trim()
        ? `Randevu tahsilatı · ${input.serviceName}`
        : 'Randevu tahsilatı',
      input.occurredAt,
      input.paymentId,
      input.actorId,
    );

    await this.refreshCollectionStatus(tx, {
      tenantId: input.tenantId,
      companyId: input.companyId,
      incomeId: income.id,
    });

    await tx.$executeRawUnsafe(
      `INSERT INTO income_audit_events(
         id,tenant_id,company_id,branch_id,income_record_id,actor_id,event_type,after_state,created_at
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,
                'INCOME_AUTO_COLLECTION_FROM_APPOINTMENT',$7::jsonb,CURRENT_TIMESTAMP)`,
      randomUUID(),
      input.tenantId,
      input.companyId,
      input.branchId,
      income.id,
      input.actorId,
      JSON.stringify({
        appointmentId: input.appointmentId,
        paymentId: input.paymentId,
        amount: input.amount,
        method: input.method,
      }),
    );

    return { id: collectionId };
  }

  async syncAppointmentPaymentRefund(
    tx: Prisma.TransactionClient,
    input: AppointmentPaymentFinanceContext & { reason: string },
  ) {
    const income = await this.findAppointmentIncomeRecord(tx, input);
    if (!income) return null;

    const collectionRows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM income_collections
       WHERE tenant_id=$1::text AND company_id=$2::text
         AND source_type='APPOINTMENT_PAYMENT' AND source_id=$3
       LIMIT 1`,
      input.tenantId,
      input.companyId,
      input.paymentId,
    );
    const collection = collectionRows[0];
    if (!collection) return null;

    const existing = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM income_collection_reversals
       WHERE tenant_id=$1::text AND company_id=$2::text
         AND source_type='APPOINTMENT_PAYMENT_REFUND' AND source_id=$3
       LIMIT 1`,
      input.tenantId,
      input.companyId,
      input.paymentId,
    );
    if (existing[0]) return existing[0];

    const refundJournal = await tx.journalEntry.findFirst({
      where: {
        companyId: input.companyId,
        referenceType: 'APPOINTMENT_PAYMENT_REFUND',
        referenceId: input.paymentId,
      },
      select: { id: true },
    });
    if (!refundJournal) {
      throw new Error('Randevu ödeme iadesi muhasebe fişi bulunamadı.');
    }

    const reversalId = randomUUID();
    await tx.$executeRawUnsafe(
      `INSERT INTO income_collection_reversals(
         id,tenant_id,company_id,branch_id,income_collection_id,journal_entry_id,reason,
         source_type,source_id,created_by,created_at
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,
                'APPOINTMENT_PAYMENT_REFUND',$8,$9::text,CURRENT_TIMESTAMP)`,
      reversalId,
      input.tenantId,
      input.companyId,
      input.branchId,
      collection.id,
      refundJournal.id,
      input.amount,
      input.reason,
      input.paymentId,
      input.actorId,
    );

    await this.refreshCollectionStatus(tx, {
      tenantId: input.tenantId,
      companyId: input.companyId,
      incomeId: income.id,
    });

    await tx.$executeRawUnsafe(
      `INSERT INTO income_audit_events(
         id,tenant_id,company_id,branch_id,income_record_id,actor_id,event_type,reason,after_state,created_at
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,
                'INCOME_AUTO_COLLECTION_REFUNDED_FROM_APPOINTMENT',$7,$8::jsonb,CURRENT_TIMESTAMP)`,
      randomUUID(),
      input.tenantId,
      input.companyId,
      input.branchId,
      income.id,
      input.actorId,
      input.reason,
      JSON.stringify({
        appointmentId: input.appointmentId,
        paymentId: input.paymentId,
        amount: input.amount,
      }),
    );

    return { id: reversalId };
  }

  private async refreshCollectionStatus(
    tx: Prisma.TransactionClient,
    input: { tenantId: string; companyId: string; incomeId: string },
  ) {
    const totals = await tx.$queryRawUnsafe<
      Array<{ gross: Prisma.Decimal; collected: Prisma.Decimal }>
    >(
      `SELECT i.gross_amount AS gross,
              COALESCE(SUM(c.amount-COALESCE((
                SELECT SUM(r.amount) FROM income_collection_reversals r WHERE r.income_collection_id=c.id
              ),0)),0) AS collected
       FROM income_records i
       LEFT JOIN income_collections c ON c.income_record_id=i.id
       WHERE i.id=$1::text AND i.tenant_id=$2::text AND i.company_id=$3::text
       GROUP BY i.gross_amount`,
      input.incomeId,
      input.tenantId,
      input.companyId,
    );
    const gross = Number(totals[0]?.gross ?? 0);
    const collected = Number(totals[0]?.collected ?? 0);
    const status =
      collected <= 0.01
        ? 'UNCOLLECTED'
        : Math.abs(gross - collected) <= 0.01
          ? 'COLLECTED'
          : 'PARTIALLY_COLLECTED';

    await tx.$executeRawUnsafe(
      `UPDATE income_records
       SET collection_status=$1::"IncomeCollectionStatus",version=version+1,updated_at=CURRENT_TIMESTAMP
       WHERE id=$2::text`,
      status,
      input.incomeId,
    );
    return status;
  }
}
