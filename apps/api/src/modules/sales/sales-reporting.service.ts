import { Injectable } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';

export type SalesReportingInput = Readonly<{
  from: Date;
  to: Date;
}>;

@Injectable()
export class SalesReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationScope: OrganizationScopeService,
  ) {}

  async performance(input: SalesReportingInput) {
    const scope = await this.organizationScope.getBranchScopedWhere();

    const sales = await this.prisma.sale.findMany({
      where: {
        ...scope,
        status: 'CONFIRMED',
        confirmedAt: { gte: input.from, lte: input.to },
      },
      orderBy: [{ confirmedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        branchId: true,
        confirmedAt: true,
        subtotal: true,
        discountTotal: true,
        total: true,
        customer: {
          select: { firstName: true, lastName: true },
        },
        items: {
          select: { type: true, quantity: true },
        },
        payments: {
          select: { amount: true, status: true },
        },
      },
    });

    return sales.map((sale) => {
      const collected = sale.payments
        .filter((payment) => payment.status === 'COMPLETED')
        .reduce((total, payment) => total + Number(payment.amount), 0);
      const refunded = sale.payments
        .filter((payment) => payment.status === 'REFUNDED')
        .reduce((total, payment) => total + Number(payment.amount), 0);
      const serviceQuantity = sale.items
        .filter((item) => item.type === 'SERVICE')
        .reduce((total, item) => total + item.quantity, 0);
      const packageQuantity = sale.items
        .filter((item) => item.type === 'PACKAGE')
        .reduce((total, item) => total + item.quantity, 0);

      return {
        id: sale.id,
        branchId: sale.branchId,
        confirmedAt: sale.confirmedAt,
        customerName: `${sale.customer.firstName} ${sale.customer.lastName}`,
        subtotal: Number(sale.subtotal),
        discountTotal: Number(sale.discountTotal),
        revenue: Number(sale.total),
        collected,
        refunded,
        netCollected: collected - refunded,
        outstanding: Math.max(0, Number(sale.total) - collected),
        itemCount: sale.items.reduce((total, item) => total + item.quantity, 0),
        serviceQuantity,
        packageQuantity,
      };
    });
  }
}
