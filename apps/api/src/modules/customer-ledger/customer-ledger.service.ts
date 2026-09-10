import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type LedgerEntryType = 'SALE' | 'PAYMENT' | 'REFUND';

interface LedgerEntry {
  id: string;
  type: LedgerEntryType;
  occurredAt: Date;
  description: string;
  debit: number;
  credit: number;
  saleId: string;
  paymentId: string | null;
  paymentMethod: string | null;
  runningBalance: number;
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

@Injectable()
export class CustomerLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private requireBranchId(): string {
    const branchId = this.tenantContext.getBranchId();
    if (!branchId) {
      throw new BadRequestException('A branch must be selected for this operation.');
    }
    return branchId;
  }

  async getCustomerLedger(customerId: string) {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();

    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId, branchId },
      select: { id: true, firstName: true, lastName: true, phone: true, email: true },
    });

    if (!customer) throw new NotFoundException('Customer not found');

    const sales = await this.prisma.sale.findMany({
      where: { tenantId, branchId, customerId, status: 'CONFIRMED' },
      include: { payments: true },
      orderBy: { confirmedAt: 'asc' },
    });

    const rawEntries: Omit<LedgerEntry, 'runningBalance'>[] = [];

    for (const sale of sales) {
      rawEntries.push({
        id: `sale:${sale.id}`,
        type: 'SALE',
        occurredAt: sale.confirmedAt ?? sale.createdAt,
        description: 'Satış',
        debit: money(Number(sale.total)),
        credit: 0,
        saleId: sale.id,
        paymentId: null,
        paymentMethod: null,
      });

      for (const payment of sale.payments) {
        rawEntries.push({
          id: `payment:${payment.id}`,
          type: 'PAYMENT',
          occurredAt: payment.paidAt,
          description: 'Tahsilat',
          debit: 0,
          credit: money(Number(payment.amount)),
          saleId: sale.id,
          paymentId: payment.id,
          paymentMethod: payment.method,
        });

        if (payment.status === 'REFUNDED' && payment.refundedAt) {
          rawEntries.push({
            id: `refund:${payment.id}`,
            type: 'REFUND',
            occurredAt: payment.refundedAt,
            description: payment.refundReason ? `İade: ${payment.refundReason}` : 'İade',
            debit: money(Number(payment.amount)),
            credit: 0,
            saleId: sale.id,
            paymentId: payment.id,
            paymentMethod: payment.method,
          });
        }
      }
    }

    rawEntries.sort((a, b) => {
      const timeDiff = a.occurredAt.getTime() - b.occurredAt.getTime();
      if (timeDiff !== 0) return timeDiff;
      const order: Record<LedgerEntryType, number> = { SALE: 0, PAYMENT: 1, REFUND: 2 };
      return order[a.type] - order[b.type];
    });

    let runningBalance = 0;
    const entries: LedgerEntry[] = rawEntries.map((entry) => {
      runningBalance = money(runningBalance + entry.debit - entry.credit);
      return { ...entry, runningBalance };
    });

    const totalSales = money(entries.reduce((sum, entry) => sum + (entry.type === 'SALE' ? entry.debit : 0), 0));
    const grossPaid = money(entries.reduce((sum, entry) => sum + (entry.type === 'PAYMENT' ? entry.credit : 0), 0));
    const totalRefunded = money(entries.reduce((sum, entry) => sum + (entry.type === 'REFUND' ? entry.debit : 0), 0));
    const netPaid = money(grossPaid - totalRefunded);
    const balance = money(totalSales - netPaid);

    return {
      customer,
      summary: {
        totalSales,
        grossPaid,
        totalRefunded,
        netPaid,
        balance,
        status: balance <= 0 ? 'SETTLED' : netPaid > 0 ? 'PARTIALLY_PAID' : 'UNPAID',
      },
      entries,
    };
  }
}
