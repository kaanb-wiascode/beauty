import { OperationsRebookingService } from './operations-rebooking.service';

describe('OperationsRebookingService', () => {
  const queryRawUnsafe = jest.fn();
  const appointmentFindUnique = jest.fn();
  const appointmentFindFirst = jest.fn();
  const appointmentCreate = jest.fn();
  const staffFindFirst = jest.fn();
  const transaction = jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      $queryRawUnsafe: queryRawUnsafe,
      appointment: {
        findUnique: appointmentFindUnique,
        findFirst: appointmentFindFirst,
        create: appointmentCreate,
      },
      staff: { findFirst: staffFindFirst },
    }),
  );
  const prisma = {
    $queryRawUnsafe: queryRawUnsafe,
    $transaction: transaction,
  } as never;
  const tenantContext = {
    getTenantId: () => 'tenant-1',
    getCompanyId: () => 'company-1',
    getBranchId: () => 'branch-1',
    getMembershipId: () => 'membership-1',
  } as never;

  const source = {
    id: 'appointment-source',
    customerId: 'customer-1',
    serviceId: 'service-1',
    staffId: 'staff-1',
    startAt: new Date('2026-09-01T10:00:00.000Z'),
    endAt: new Date('2026-09-01T11:00:00.000Z'),
    status: 'COMPLETED',
    durationMinutes: 60,
    serviceName: 'Cilt Bakımı',
    customerName: 'Ayşe Müşteri',
    staffName: 'Elif Uzman',
    recommendedIntervalDays: 28,
  };

  beforeEach(() => {
    queryRawUnsafe.mockReset();
    appointmentFindUnique.mockReset();
    appointmentFindFirst.mockReset();
    appointmentCreate.mockReset();
    staffFindFirst.mockReset();
    transaction.mockClear();
  });

  it('calculates the recommended next appointment from the configured service interval', async () => {
    queryRawUnsafe.mockResolvedValueOnce([source]);
    const service = new OperationsRebookingService(prisma, tenantContext);

    const result = await service.getRecommendation(source.id);

    expect(result.recommendedIntervalDays).toBe(28);
    expect(result.recommendedStartAt?.toISOString()).toBe(
      '2026-09-29T11:00:00.000Z',
    );
    expect(result.preferredStaffId).toBe('staff-1');
  });

  it('returns the existing linked appointment when the source was already rebooked', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'rebooking-1', targetAppointmentId: 'appointment-target' },
      ]);
    appointmentFindUnique.mockResolvedValueOnce({
      id: 'appointment-target',
      status: 'SCHEDULED',
    });

    const service = new OperationsRebookingService(prisma, tenantContext);
    const result = await service.create(source.id, {
      startAt: new Date('2026-10-01T10:00:00.000Z'),
    });

    expect(result).toMatchObject({
      rebookingId: 'rebooking-1',
      idempotent: true,
    });
    expect(appointmentCreate).not.toHaveBeenCalled();
  });
});
