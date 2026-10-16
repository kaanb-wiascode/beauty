import { Injectable } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';

export type CustomerPerformanceInput = Readonly<{
  from: Date;
  to: Date;
}>;

@Injectable()
export class CustomerReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationScope: OrganizationScopeService,
  ) {}

  async performance(input: CustomerPerformanceInput) {
    const scope = await this.organizationScope.getBranchScopedWhere();

    const [customers, appointments] = await Promise.all([
      this.prisma.customer.findMany({
        where: scope,
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          branchId: true,
          createdAt: true,
          customerSource: true,
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          ...scope,
          startAt: { gte: input.from, lte: input.to },
        },
        select: {
          id: true,
          customerId: true,
          startAt: true,
          status: true,
          payment: {
            select: { amount: true, status: true },
          },
        },
      }),
    ]);

    return customers.map((customer) => {
      const visits = appointments.filter(
        (appointment) => appointment.customerId === customer.id,
      );
      const completedVisits = visits.filter(
        (appointment) => appointment.status === 'COMPLETED',
      );
      const completedDates = completedVisits
        .map((appointment) => appointment.startAt)
        .sort((a, b) => a.getTime() - b.getTime());
      const collected = visits.reduce((total, appointment) => {
        if (appointment.payment?.status !== 'COMPLETED') return total;
        return total + Number(appointment.payment.amount);
      }, 0);

      return {
        id: customer.id,
        name: `${customer.firstName} ${customer.lastName}`,
        branchId: customer.branchId,
        customerSource: customer.customerSource,
        customerSince: customer.createdAt,
        visitCount: visits.length,
        completedVisits: completedVisits.length,
        firstVisitAt: completedDates[0] ?? null,
        lastVisitAt: completedDates.length
          ? completedDates[completedDates.length - 1]
          : null,
        collected,
        averageCollectedPerVisit: completedVisits.length
          ? collected / completedVisits.length
          : 0,
      };
    });
  }
}
