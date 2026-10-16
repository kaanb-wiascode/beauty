import { Test } from '@nestjs/testing';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { WorkforceCapacityService } from '../hr/workforce-capacity.service';
import { OperationsCapacityService } from './operations-capacity.service';
import { OperationsOptimizationService } from './operations-optimization.service';
import { OperationsUtilizationService } from './operations-utilization.service';

describe('OperationsOptimizationService', () => {
  const queryRawUnsafe = jest.fn();
  const prisma = { $queryRawUnsafe: queryRawUnsafe };
  const tenantContext = {
    getTenantId: () => 'tenant-1',
    getCompanyId: () => 'company-1',
    getBranchId: () => 'branch-1',
  };
  const capacity = { summary: jest.fn() };
  const utilization = { summary: jest.fn() };
  const workforceCapacity = { analyze: jest.fn() };
  let service: OperationsOptimizationService;

  beforeEach(async () => {
    queryRawUnsafe.mockReset();
    capacity.summary.mockReset();
    utilization.summary.mockReset();
    workforceCapacity.analyze.mockReset();
    workforceCapacity.analyze.mockResolvedValue({
      branches: [{ branchId: 'branch-1', utilizationPercent: 70, shortageMinutes: 0, shortageHours: 0 }],
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        OperationsOptimizationService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantContext, useValue: tenantContext },
        { provide: OperationsCapacityService, useValue: capacity },
        { provide: OperationsUtilizationService, useValue: utilization },
        { provide: WorkforceCapacityService, useValue: workforceCapacity },
      ],
    }).compile();

    service = moduleRef.get(OperationsOptimizationService);
  });

  it('recommends balancing staff load and preserves deterministic scheduling authority', async () => {
    capacity.summary.mockResolvedValue({ bottlenecks: [], totals: { utilizationPercent: 40 } });
    utilization.summary.mockResolvedValue({
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

    const result = await service.overview(24);

    expect(result.automaticSchedulingEnabled).toBe(false);
    expect(result.evidence.workforceSource).toBe('HR_PUBLISHED_SHIFTS_AND_APPROVED_LEAVE');
    expect(result.staffRecommendations).toEqual([
      expect.objectContaining({ code: 'STAFF_LOAD_IMBALANCE', priority: 'HIGH' }),
    ]);
  });

  it('surfaces a published-shift workforce shortage', async () => {
    capacity.summary.mockResolvedValue({ bottlenecks: [], totals: { utilizationPercent: 35 } });
    utilization.summary.mockResolvedValue({
      shiftAware: false,
      totals: { activeStaff: 1, utilizationPercent: 30 },
      staff: [{ staffId: 'staff-1', staffName: 'Staff', utilizationPercent: 30 }],
    });
    workforceCapacity.analyze.mockResolvedValue({
      branches: [{ branchId: 'branch-1', utilizationPercent: 120, shortageMinutes: 90, shortageHours: 1.5 }],
    });
    queryRawUnsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { recentAppointments: 10, recentNoShows: 0, previousAppointments: 30, previousNoShows: 1 },
    ]);

    const result = await service.overview(24);

    expect(result.capacityRecommendations).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'WORKFORCE_SHIFT_SHORTAGE', priority: 'HIGH' })]),
    );
    expect(result.anomalies).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'WORKFORCE_CAPACITY_SATURATION' })]),
    );
  });

  it('detects a no-show spike from recent operational outcomes', async () => {
    capacity.summary.mockResolvedValue({ bottlenecks: [], totals: { utilizationPercent: 35 } });
    utilization.summary.mockResolvedValue({
      shiftAware: false,
      totals: { activeStaff: 1, utilizationPercent: 30 },
      staff: [{ staffId: 'staff-1', staffName: 'Staff', utilizationPercent: 30 }],
    });
    queryRawUnsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { recentAppointments: 10, recentNoShows: 3, previousAppointments: 40, previousNoShows: 2 },
    ]);

    const result = await service.overview(24);

    expect(result.anomalies).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'NO_SHOW_RATE_SPIKE', severity: 'HIGH' })]),
    );
  });
});
