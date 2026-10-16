import { Test } from '@nestjs/testing';
import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { OperationsIntelligenceService } from './operations-intelligence.service';

describe('OperationsIntelligenceService', () => {
  const queryRawUnsafe = jest.fn(
    async (..._args: unknown[]): Promise<unknown[]> => [],
  );
  const prisma = { $queryRawUnsafe: queryRawUnsafe };
  const tenantContext = {
    getTenantId: () => 'tenant-1',
    getCompanyId: () => 'company-1',
    getBranchId: () => 'branch-1',
  };
  let service: OperationsIntelligenceService;

  beforeEach(async () => {
    queryRawUnsafe.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [
        OperationsIntelligenceService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantContext, useValue: tenantContext },
      ],
    }).compile();
    service = moduleRef.get(OperationsIntelligenceService);
  });

  it('reduces no-show risk when the appointment is confirmed', async () => {
    queryRawUnsafe.mockResolvedValueOnce([
      {
        appointmentId: 'appointment-1',
        customerId: 'customer-1',
        customerName: 'Ayşe Yılmaz',
        staffId: 'staff-1',
        staffName: 'Elif Uzman',
        serviceId: 'service-1',
        serviceName: 'Cilt Bakımı',
        startAt: new Date('2026-09-16T10:00:00.000Z'),
        endAt: new Date('2026-09-16T11:00:00.000Z'),
        confirmationStatus: 'CONFIRMED',
        customerAppointmentCount: 4,
        customerNoShowCount: 1,
        customerLateCancellationCount: 0,
        historicalServiceCount: 5,
        averageServiceOverrunMinutes: 0,
        previousStaffAppointmentEndsAt: new Date('2026-09-16T09:30:00.000Z'),
        activeResourceConflictCount: 0,
      },
    ]);

    const result = await service.overview(24);

    expect(result.appointments[0]?.noShowRisk.score).toBe(25);
    expect(result.appointments[0]?.noShowRisk.level).toBe('LOW');
  });

  it('marks an upcoming resource conflict as high delay risk', async () => {
    queryRawUnsafe.mockResolvedValueOnce([
      {
        appointmentId: 'appointment-2',
        customerId: 'customer-2',
        customerName: 'Merve Demir',
        staffId: 'staff-2',
        staffName: 'Selin Uzman',
        serviceId: 'service-2',
        serviceName: 'Lazer',
        startAt: new Date('2026-09-16T12:00:00.000Z'),
        endAt: new Date('2026-09-16T13:00:00.000Z'),
        confirmationStatus: 'PENDING',
        customerAppointmentCount: 3,
        customerNoShowCount: 0,
        customerLateCancellationCount: 0,
        historicalServiceCount: 10,
        averageServiceOverrunMinutes: 12,
        previousStaffAppointmentEndsAt: new Date('2026-09-16T11:55:00.000Z'),
        activeResourceConflictCount: 1,
      },
    ]);

    const result = await service.overview(24);

    expect(result.appointments[0]?.delayRisk.level).toBe('HIGH');
    expect(
      result.managerInsights.some(
        (item) => item.code === 'RESOURCE_CONFLICTS_UPCOMING',
      ),
    ).toBe(true);
  });
});
