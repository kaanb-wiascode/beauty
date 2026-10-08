import { OperationsUtilizationService } from './operations-utilization.service';

describe('OperationsUtilizationService', () => {
  const staffFindMany = jest.fn();
  const queryRawUnsafe = jest.fn();
  const prisma = {
    staff: { findMany: staffFindMany },
    $queryRawUnsafe: queryRawUnsafe,
  } as never;
  const tenantContext = {
    getTenantId: () => 'tenant-1',
    getCompanyId: () => 'company-1',
    getBranchId: () => 'branch-1',
  } as never;

  beforeEach(() => {
    staffFindMany.mockReset();
    queryRawUnsafe.mockReset();
  });

  it('clips appointment time to the requested window and merges overlapping staff intervals', async () => {
    staffFindMany.mockResolvedValue([
      { id: 'staff-1', firstName: 'Ada', lastName: 'Yılmaz' },
    ]);
    queryRawUnsafe.mockResolvedValue([
      {
        id: 'appointment-1',
        staffId: 'staff-1',
        serviceId: 'service-1',
        serviceName: 'Lazer',
        startAt: new Date('2026-09-15T08:30:00.000Z'),
        endAt: new Date('2026-09-15T09:30:00.000Z'),
      },
      {
        id: 'appointment-2',
        staffId: 'staff-1',
        serviceId: 'service-2',
        serviceName: 'Cilt Bakımı',
        startAt: new Date('2026-09-15T09:15:00.000Z'),
        endAt: new Date('2026-09-15T10:30:00.000Z'),
      },
    ]);

    const service = new OperationsUtilizationService(prisma, tenantContext);
    const result = await service.summary({
      from: new Date('2026-09-15T09:00:00.000Z'),
      to: new Date('2026-09-15T10:00:00.000Z'),
    });

    expect(result.staff[0]).toEqual(
      expect.objectContaining({
        capacityMinutes: 60,
        bookedMinutes: 60,
        availableMinutes: 0,
        utilizationPercent: 100,
        appointmentCount: 2,
      }),
    );
    expect(result.totals.bookedMinutes).toBe(60);
  });

  it('reports branch utilization and service demand share for active staff capacity', async () => {
    staffFindMany.mockResolvedValue([
      { id: 'staff-1', firstName: 'Ada', lastName: 'Yılmaz' },
      { id: 'staff-2', firstName: 'Ece', lastName: 'Demir' },
    ]);
    queryRawUnsafe.mockResolvedValue([
      {
        id: 'appointment-1',
        staffId: 'staff-1',
        serviceId: 'service-1',
        serviceName: 'Lazer',
        startAt: new Date('2026-09-15T09:00:00.000Z'),
        endAt: new Date('2026-09-15T09:30:00.000Z'),
      },
      {
        id: 'appointment-2',
        staffId: 'staff-2',
        serviceId: 'service-1',
        serviceName: 'Lazer',
        startAt: new Date('2026-09-15T09:30:00.000Z'),
        endAt: new Date('2026-09-15T10:00:00.000Z'),
      },
    ]);

    const service = new OperationsUtilizationService(prisma, tenantContext);
    const result = await service.summary({
      from: new Date('2026-09-15T09:00:00.000Z'),
      to: new Date('2026-09-15T10:00:00.000Z'),
    });

    expect(result.totals).toEqual(
      expect.objectContaining({
        activeStaff: 2,
        capacityMinutes: 120,
        bookedMinutes: 60,
        availableMinutes: 60,
        utilizationPercent: 50,
      }),
    );
    expect(result.services[0]).toEqual(
      expect.objectContaining({
        serviceId: 'service-1',
        bookedMinutes: 60,
        appointmentCount: 2,
        shareOfBookedMinutesPercent: 100,
      }),
    );
    expect(result.shiftAware).toBe(false);
    expect(result.availabilityBasis).toBe('REQUEST_WINDOW');
  });
});
