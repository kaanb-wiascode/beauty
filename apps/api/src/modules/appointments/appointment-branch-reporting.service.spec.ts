import { Test } from '@nestjs/testing';

import { PrismaService } from '@beauty-erp/database';

import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { AppointmentReportingService } from './appointment-reporting.service';

describe('AppointmentReportingService branch performance', () => {
  const findMany = jest.fn();
  const getBranchScopedWhere = jest.fn();
  let service: AppointmentReportingService;

  beforeEach(async () => {
    findMany.mockReset();
    getBranchScopedWhere.mockReset();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AppointmentReportingService,
        {
          provide: PrismaService,
          useValue: {
            appointment: { findMany },
          },
        },
        {
          provide: OrganizationScopeService,
          useValue: { getBranchScopedWhere },
        },
      ],
    }).compile();

    service = moduleRef.get(AppointmentReportingService);
  });

  it('aggregates only appointments from the authenticated branch scope', async () => {
    getBranchScopedWhere.mockResolvedValue({
      tenantId: 'tenant-1',
      branchId: { in: ['branch-a', 'branch-b'] },
    });
    findMany.mockResolvedValue([
      {
        branchId: 'branch-a',
        customerId: 'customer-1',
        status: 'COMPLETED',
        branch: { name: 'Kadıköy' },
        payment: { amount: 600, status: 'COMPLETED' },
      },
      {
        branchId: 'branch-a',
        customerId: 'customer-2',
        status: 'NO_SHOW',
        branch: { name: 'Kadıköy' },
        payment: null,
      },
      {
        branchId: 'branch-b',
        customerId: 'customer-3',
        status: 'COMPLETED',
        branch: { name: 'Nişantaşı' },
        payment: { amount: 900, status: 'COMPLETED' },
      },
      {
        branchId: 'branch-b',
        customerId: 'customer-3',
        status: 'CANCELLED',
        branch: { name: 'Nişantaşı' },
        payment: { amount: 300, status: 'PENDING' },
      },
    ]);

    const input = {
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-30T23:59:59.999Z'),
    };
    const result = await service.branchPerformance(input);

    expect(getBranchScopedWhere).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        branchId: { in: ['branch-a', 'branch-b'] },
        startAt: { gte: input.from, lte: input.to },
      },
      select: {
        branchId: true,
        customerId: true,
        status: true,
        branch: { select: { name: true } },
        payment: { select: { amount: true, status: true } },
      },
    });
    expect(result).toEqual([
      {
        id: 'branch-a',
        branchName: 'Kadıköy',
        appointmentCount: 2,
        completedCount: 1,
        cancelledCount: 0,
        noShowCount: 1,
        completionRate: 50,
        uniqueCustomerCount: 2,
        collected: 600,
        averageCollectedPerCompleted: 600,
      },
      {
        id: 'branch-b',
        branchName: 'Nişantaşı',
        appointmentCount: 2,
        completedCount: 1,
        cancelledCount: 1,
        noShowCount: 0,
        completionRate: 50,
        uniqueCustomerCount: 1,
        collected: 900,
        averageCollectedPerCompleted: 900,
      },
    ]);
  });
});
