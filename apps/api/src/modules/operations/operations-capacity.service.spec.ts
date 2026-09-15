import { OperationsCapacityService } from './operations-capacity.service';

describe('OperationsCapacityService', () => {
  const queryRawUnsafe = jest.fn();
  const prisma = { $queryRawUnsafe: queryRawUnsafe } as never;
  const tenantContext = {
    getTenantId: () => 'tenant-1',
    getCompanyId: () => 'company-1',
    getBranchId: () => 'branch-1',
  } as never;

  beforeEach(() => {
    queryRawUnsafe.mockReset();
  });

  it('counts only allocation overlap inside the requested window', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([
        {
          resourceType: 'ROOM',
          resourceId: 'room-1',
          resourceName: 'Laser Room',
          category: 'LASER_ROOM',
          unavailable: false,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          roomId: 'room-1',
          assetId: null,
          blockedFrom: new Date('2026-09-15T08:30:00.000Z'),
          blockedTo: new Date('2026-09-15T10:30:00.000Z'),
        },
      ]);

    const service = new OperationsCapacityService(prisma, tenantContext);
    const result = await service.summary({
      from: new Date('2026-09-15T09:00:00.000Z'),
      to: new Date('2026-09-15T10:00:00.000Z'),
    });

    expect(result.totals.capacityMinutes).toBe(60);
    expect(result.totals.allocatedMinutes).toBe(60);
    expect(result.totals.remainingMinutes).toBe(0);
    expect(result.totals.utilizationPercent).toBe(100);
    expect(result.bottlenecks[0]?.reason).toBe('CRITICAL_UTILIZATION');
  });

  it('removes unavailable resources from effective capacity', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([
        {
          resourceType: 'ROOM',
          resourceId: 'room-1',
          resourceName: 'Room 1',
          category: 'TREATMENT_ROOM',
          unavailable: false,
        },
        {
          resourceType: 'ROOM',
          resourceId: 'room-2',
          resourceName: 'Room 2',
          category: 'TREATMENT_ROOM',
          unavailable: true,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const service = new OperationsCapacityService(prisma, tenantContext);
    const result = await service.summary({
      from: new Date('2026-09-15T09:00:00.000Z'),
      to: new Date('2026-09-15T10:00:00.000Z'),
    });

    expect(result.totals.resources).toBe(2);
    expect(result.totals.unavailableResources).toBe(1);
    expect(result.totals.capacityMinutes).toBe(60);
    expect(result.categories[0]?.totalResources).toBe(2);
    expect(result.categories[0]?.unavailableResources).toBe(1);
  });
});
