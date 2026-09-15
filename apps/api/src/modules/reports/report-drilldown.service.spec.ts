import { ForbiddenException } from '@nestjs/common';

import { ReportDrilldownService } from './report-drilldown.service';

const user = {
  sub: 'user-1',
  tenantId: 'tenant-1',
  companyId: 'company-1',
  branchId: 'branch-1',
  membershipId: 'membership-1',
  roleId: 'role-1',
  roleScope: 'BRANCH' as const,
};

const input = {
  reportKey: 'staff.performance' as const,
  dimension: 'appointments' as const,
  rowId: '11111111-1111-4111-8111-111111111111',
  filters: {
    from: new Date('2026-09-01T00:00:00.000Z'),
    to: new Date('2026-09-30T23:59:59.999Z'),
  },
  page: 1,
  limit: 25,
};

function createService() {
  const prisma = {
    appointment: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'appointment-1',
          startAt: new Date('2026-09-15T10:00:00.000Z'),
          endAt: new Date('2026-09-15T11:00:00.000Z'),
          status: 'COMPLETED',
          payment: { amount: 1250, status: 'COMPLETED' },
        },
      ]),
      count: jest.fn().mockResolvedValue(1),
    },
  } as any;
  const staff = { findOne: jest.fn().mockResolvedValue({ id: input.rowId }) } as any;
  const services = { findOne: jest.fn() } as any;
  const reports = {
    getCatalog: jest.fn().mockResolvedValue([{ key: 'staff.performance' }]),
  } as any;

  return {
    prisma,
    staff,
    services,
    reports,
    service: new ReportDrilldownService(prisma, staff, services, reports),
  };
}

describe('ReportDrilldownService', () => {
  it('validates the parent entity before querying tenant-scoped appointments', async () => {
    const { service, prisma, staff } = createService();

    const result = await service.drilldown(user, input);

    expect(staff.findOne).toHaveBeenCalledWith(input.rowId);
    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          staffId: input.rowId,
          startAt: { gte: input.filters.from, lte: input.filters.to },
        }),
      }),
    );
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: 'appointment-1',
        paymentAmount: 1250,
        paymentStatus: 'COMPLETED',
      }),
    );
  });

  it('does not query child rows after report permission revocation', async () => {
    const { service, reports, prisma, staff } = createService();
    reports.getCatalog.mockResolvedValueOnce([]);

    await expect(service.drilldown(user, input)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(staff.findOne).not.toHaveBeenCalled();
    expect(prisma.appointment.findMany).not.toHaveBeenCalled();
  });

  it('uses service scope validation for service performance drilldowns', async () => {
    const { service, reports, services, prisma } = createService();
    reports.getCatalog.mockResolvedValueOnce([{ key: 'service.performance' }]);
    services.findOne.mockResolvedValueOnce({ id: input.rowId });

    await service.drilldown(user, {
      ...input,
      reportKey: 'service.performance',
    });

    expect(services.findOne).toHaveBeenCalledWith(input.rowId);
    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          serviceId: input.rowId,
        }),
      }),
    );
  });
});
