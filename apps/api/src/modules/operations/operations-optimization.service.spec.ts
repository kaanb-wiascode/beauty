import { OperationsOptimizationService } from './operations-optimization.service';

describe('OperationsOptimizationService', () => {
  const queryRawUnsafe = jest.fn();
  const prisma = { $queryRawUnsafe: queryRawUnsafe } as never;
  const tenantContext = {
    getTenantId: () => 'tenant-1',
    getCompanyId: () => 'company-1',
    getBranchId: () => 'branch-1',
  } as never;
  const capacity = { summary: jest.fn() } as never;
  const utilization = { summary: jest.fn() } as never;
  const workforceCapacity = { analyze: jest.fn() } as never;

  beforeEach(() => {
    queryRawUnsafe.mockReset();
    (capacity.summary as jest.Mock).mockReset();
    (utilization.summary as jest.Mock).mockReset();
    (workforceCapacity.analyze as jest.Mock).mockReset();
    (workforceCapacity.analyze as jest.Mock).mockResolvedValue({
      branches: [{ branchId: 'branch-1', utilizationPercent: 70, shortageMinutes: 0, shortageHours: 0 }],
    });
  });

  it('recommends balancing staff load and preserves deterministic scheduling authority', async () => {
    (capacity.summary as jest.Mock).mockResolvedValue({ bottlenecks: [], totals: { utilizationPercent: 40 } });
    (utilization.summary as jest.Mock).mockResolvedValue({
      shiftAware: false,
      totals: { activeStaff: 2, utilizationPercent: 62.5 },
      staff: [
        { staffId: 'staff-high', staffName: 'High Load', utilizationPercent: 95 },
        { staffId: 'staff-low', staffName: 'Low Load', utilizationPercent: 30 },
      ],
    });
    queryRawUnsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { recentAppointments: 10, recentNoShows: 0, previousAppointments: 30, previousNoShows: 1 },
    ]);

    const service = new OperationsOptimizationService(
      prisma,
      tenantContext,
      capacity,
      utilization,
      workforceCapacity,
    );
    const result = await service.overview(24);

    expect(result.automaticSchedulingEnabled).toBe(false);
    expect(result.evidence.workforceSource).toBe('HR_PUBLISHED_SHIFTS_AND_APPROVED_LEAVE');
    expect(result.staffRecommendations).toEqual([
      expect.objectContaining({ code: 'STAFF_LOAD_IMBALANCE', priority: 'HIGH' }),
    ]);
  });

  it('surfaces a published-shift workforce shortage', async () => {
    (capacity.summary as jest.Mock).mockResolvedValue({ bottlenecks: [], totals: { utilizationPercent: 35 } });
    (utilization.summary as jest.Mock).mockResolvedValue({
      shiftAware: false,
      totals: { activeStaff: 1, utilizationPercent: 30 },
      staff: [{ staffId: 'staff-1', staffName: 'Staff', utilizationPercent: 30 }],
    });
    (workforceCapacity.analyze as jest.Mock).mockResolvedValue({
      branches: [{ branchId: 'branch-1', utilizationPercent: 120, shortageMinutes: 90, shortageHours: 1.5 }],
    });
    queryRawUnsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { recentAppointments: 10, recentNoShows: 0, previousAppointments: 30, previousNoShows: 1 },
    ]);

    const service = new OperationsOptimizationService(
      prisma,
      tenantContext,
      capacity,
      utilization,
      workforceCapacity,
    );
    const result = await service.overview(24);

    expect(result.capacityRecommendations).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'WORKFORCE_SHIFT_SHORTAGE', priority: 'HIGH' })]),
    );
    expect(result.anomalies).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'WORKFORCE_CAPACITY_SATURATION' })]),
    );
  });

  it('detects a no-show spike from recent operational outcomes', async () => {
    (capacity.summary as jest.Mock).mockResolvedValue({ bottlenecks: [], totals: { utilizationPercent: 35 } });
    (utilization.summary as jest.Mock).mockResolvedValue({
      shiftAware: false,
      totals: { activeStaff: 1, utilizationPercent: 30 },
      staff: [{ staffId: 'staff-1', staffName: 'Staff', utilizationPercent: 30 }],
    });
    queryRawUnsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { recentAppointments: 10, recentNoShows: 3, previousAppointments: 40, previousNoShows: 2 },
    ]);

    const service = new OperationsOptimizationService(
      prisma,
      tenantContext,
      capacity,
      utilization,
      workforceCapacity,
    );
    const result = await service.overview(24);

    expect(result.anomalies).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'NO_SHOW_RATE_SPIKE', severity: 'HIGH' })]),
    );
  });
});
