import { Injectable } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';

export type AppointmentReportingInput = Readonly<{
  from: Date;
  to: Date;
}>;

@Injectable()
export class AppointmentReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationScope: OrganizationScopeService,
  ) {}

  async performance(input: AppointmentReportingInput) {
    const scope = await this.organizationScope.getBranchScopedWhere();

    const appointments = await this.prisma.appointment.findMany({
      where: {
        ...scope,
        startAt: { gte: input.from, lte: input.to },
      },
      orderBy: { startAt: 'asc' },
      select: {
        id: true,
        customerId: true,
        startAt: true,
        endAt: true,
        status: true,
        payment: { select: { amount: true, status: true } },
      },
    });

    const customerIds = [...new Set(appointments.map((item) => item.customerId))];
    const firstVisits = customerIds.length
      ? await this.prisma.appointment.groupBy({
          by: ['customerId'],
          where: { ...scope, customerId: { in: customerIds } },
          _min: { startAt: true },
        })
      : [];
    const firstVisitByCustomer = new Map(
      firstVisits.map((row) => [row.customerId, row._min.startAt]),
    );

    const completedCustomerIds = [
      ...new Set(
        appointments
          .filter((item) => item.status === 'COMPLETED')
          .map((item) => item.customerId),
      ),
    ];
    const laterAppointments = completedCustomerIds.length
      ? await this.prisma.appointment.findMany({
          where: {
            ...scope,
            customerId: { in: completedCustomerIds },
            startAt: { gt: input.to },
            status: { in: ['SCHEDULED', 'CONFIRMED', 'COMPLETED'] },
          },
          select: { customerId: true },
          distinct: ['customerId'],
        })
      : [];
    const rebookedCustomers = new Set(laterAppointments.map((item) => item.customerId));

    const buckets = new Map<string, {
      date: string;
      appointmentCount: number;
      scheduledCount: number;
      confirmedCount: number;
      completedCount: number;
      cancelledCount: number;
      noShowCount: number;
      newCustomerCount: number;
      repeatCustomerCount: number;
      collected: number;
      totalDurationMinutes: number;
      hours: Map<number, number>;
      customers: Set<string>;
      completedCustomers: Set<string>;
      rebooked: Set<string>;
    }>();

    for (const appointment of appointments) {
      const date = appointment.startAt.toISOString().slice(0, 10);
      const bucket = buckets.get(date) ?? {
        date,
        appointmentCount: 0,
        scheduledCount: 0,
        confirmedCount: 0,
        completedCount: 0,
        cancelledCount: 0,
        noShowCount: 0,
        newCustomerCount: 0,
        repeatCustomerCount: 0,
        collected: 0,
        totalDurationMinutes: 0,
        hours: new Map<number, number>(),
        customers: new Set<string>(),
        completedCustomers: new Set<string>(),
        rebooked: new Set<string>(),
      };

      bucket.appointmentCount += 1;
      bucket.customers.add(appointment.customerId);
      if (appointment.status === 'SCHEDULED') bucket.scheduledCount += 1;
      if (appointment.status === 'CONFIRMED') bucket.confirmedCount += 1;
      if (appointment.status === 'COMPLETED') {
        bucket.completedCount += 1;
        bucket.completedCustomers.add(appointment.customerId);
      }
      if (appointment.status === 'CANCELLED') bucket.cancelledCount += 1;
      if (appointment.status === 'NO_SHOW') bucket.noShowCount += 1;

      const firstVisit = firstVisitByCustomer.get(appointment.customerId);
      if (firstVisit && firstVisit.getTime() === appointment.startAt.getTime()) {
        bucket.newCustomerCount += 1;
      } else {
        bucket.repeatCustomerCount += 1;
      }

      if (
        appointment.status === 'COMPLETED' &&
        rebookedCustomers.has(appointment.customerId)
      ) {
        bucket.rebooked.add(appointment.customerId);
      }

      if (appointment.payment?.status === 'COMPLETED') {
        bucket.collected += Number(appointment.payment.amount);
      }
      bucket.totalDurationMinutes += Math.max(
        0,
        Math.round((appointment.endAt.getTime() - appointment.startAt.getTime()) / 60000),
      );
      const hour = appointment.startAt.getUTCHours();
      bucket.hours.set(hour, (bucket.hours.get(hour) ?? 0) + 1);
      buckets.set(date, bucket);
    }

    return [...buckets.values()].map((bucket) => {
      const peakHour = [...bucket.hours.entries()].sort(
        (a, b) => b[1] - a[1] || a[0] - b[0],
      )[0]?.[0] ?? null;
      const resolved = bucket.completedCount + bucket.cancelledCount + bucket.noShowCount;
      return {
        date: bucket.date,
        appointmentCount: bucket.appointmentCount,
        scheduledCount: bucket.scheduledCount,
        confirmedCount: bucket.confirmedCount,
        completedCount: bucket.completedCount,
        cancelledCount: bucket.cancelledCount,
        noShowCount: bucket.noShowCount,
        completionRate: resolved ? Math.round((bucket.completedCount / resolved) * 100) : 0,
        cancellationRate: resolved ? Math.round((bucket.cancelledCount / resolved) * 100) : 0,
        noShowRate: resolved ? Math.round((bucket.noShowCount / resolved) * 100) : 0,
        uniqueCustomerCount: bucket.customers.size,
        completedCustomerCount: bucket.completedCustomers.size,
        newCustomerCount: bucket.newCustomerCount,
        repeatCustomerCount: bucket.repeatCustomerCount,
        rebookedCustomerCount: bucket.rebooked.size,
        rebookingRate: bucket.completedCustomers.size
          ? Math.round((bucket.rebooked.size / bucket.completedCustomers.size) * 100)
          : 0,
        collected: bucket.collected,
        averageDurationMinutes: bucket.appointmentCount
          ? Math.round(bucket.totalDurationMinutes / bucket.appointmentCount)
          : 0,
        peakHour,
      };
    });
  }
}
