import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class AccountsPayableReversalsService {
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
    await tx.$queryRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      `account:${companyId}`,
      code,
    );

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

  async reversePayment(billId: string, paymentId: string, reason: string) {
    const { tenantId, companyId, branchId } = this.context();
    const normalizedReason = reason.trim();
    if (!normalizedReason) throw new BadRequestException('Reversal reason is required.');

    return this.prisma.$transaction(
      async (tx) => {
        const bills = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,amount,status FROM supplier_bills
           WHERE id=$1::text AND company_id=$2::text AND ($3::text IS NULL OR branch_id=$3::text)
           FOR UPDATE`,
          billId,
          companyId,
          branchId,
        );
        if (!bills.length) throw new NotFoundException('Supplier bill not found');
        if (bills[0].status === 'CANCELLED') {
          throw new BadRequestException('Payments on a cancelled bill cannot be reversed.');
        }

        const payments = await tx.$queryRawUnsafe<any[]>(
          `SELECT p.id,p.amount,p.method,p.reference,p.note,p.reversal_of_payment_id AS "reversalOfPaymentId"
           FROM supplier_bill_payments p
           WHERE p.id=$1::text AND p.supplier_bill_id=$2::text AND p.company_id=$3::text
           FOR UPDATE`,
          paymentId,
          billId,
          companyId,
        );
        if (!payments.length) throw new NotFoundException('Supplier payment not found');
        const payment = payments[0];
        if (Number(payment.amount) <= 0 || payment.reversalOfPaymentId) {
          throw new BadRequestException('Only original positive supplier payments can be reversed.');
        }

        const existingReversal = await tx.$queryRawUnsafe<any[]>(
          `SELECT id FROM supplier_bill_payments WHERE reversal_of_payment_id=$1::text LIMIT 1`,
          paymentId,
        );
        if (existingReversal.length) {
          throw new BadRequestException('Supplier payment is already reversed.');
        }

        const reversalId = randomUUID();
        await tx.$executeRawUnsafe(
          `INSERT INTO supplier_bill_payments(
             id,tenant_id,company_id,branch_id,supplier_bill_id,amount,method,reference,note,reversal_of_payment_id,reversal_reason
           ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,$7::"PaymentMethod",$8,$9,$10::text,$11)`,
          reversalId,
          tenantId,
          companyId,
          branchId,
          billId,
          -Number(payment.amount),
          payment.method,
          payment.reference || paymentId,
          `Ödeme ters kaydı: ${normalizedReason}`,
          paymentId,
          normalizedReason,
        );

        const payable = await this.ensureAccount(tx, tenantId, companyId, '320', 'Satıcılar', 'LIABILITY');
        const paymentAccount =
          payment.method === 'CASH'
            ? await this.ensureAccount(tx, tenantId, companyId, '100', 'Kasa', 'ASSET')
            : await this.ensureAccount(tx, tenantId, companyId, '102', 'Bankalar', 'ASSET');

        const now = new Date();
        await tx.journalEntry.create({
          data: {
            tenantId,
            companyId,
            branchId,
            number: this.journalNumber(now),
            status: 'POSTED',
            entryDate: now,
            description: `Tedarikçi ödeme ters kaydı ${paymentId}`,
            referenceType: 'SUPPLIER_BILL_PAYMENT_REVERSAL',
            referenceId: paymentId,
            postedAt: now,
            lines: {
              create: [
                { accountId: paymentAccount.id, debit: Number(payment.amount), credit: 0 },
                { accountId: payable.id, debit: 0, credit: Number(payment.amount) },
              ],
            },
          },
        });

        const totals = await tx.$queryRawUnsafe<any[]>(
          `SELECT COALESCE(SUM(amount),0)::numeric AS paid
           FROM supplier_bill_payments WHERE supplier_bill_id=$1::text`,
          billId,
        );
        const paid = Number(totals[0]?.paid ?? 0);
        const total = Number(bills[0].amount);
        const nextStatus = paid <= 0 ? 'OPEN' : paid >= total ? 'PAID' : 'PARTIALLY_PAID';
        await tx.$executeRawUnsafe(
          `UPDATE supplier_bills SET status=$2::"SupplierBillStatus",updated_at=NOW() WHERE id=$1::text`,
          billId,
          nextStatus,
        );

        return {
          id: reversalId,
          billId,
          reversedPaymentId: paymentId,
          amount: Number(payment.amount),
          reason: normalizedReason,
          status: nextStatus,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
