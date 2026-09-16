import { ConflictException, NotFoundException } from '@nestjs/common';

import { OperationsWaitlistService } from './operations-waitlist.service';

describe('OperationsWaitlistService', () => {
  const queryRawUnsafe = jest.fn();
  const executeRawUnsafe = jest.fn();
  const customerFindFirst = jest.fn();
  const serviceFindFirst = jest.fn();
  const staffFindFirst = jest.fn();
  const transaction = jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      $queryRawUnsafe: queryRawUnsafe,
      $executeRawUnsafe: executeRawUnsafe,
      customer: { findFirst: customerFindFirst },
      service: { findFirst: serviceFindFirst },
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

  beforeEach(() => {
    queryRawUnsafe.mockReset();
    executeRawUnsafe.mockReset();
    customerFindFirst.mockReset();
    serviceFindFirst.mockReset();
    staffFindFirst.mockReset();
    transaction.mockClear();
  });

  it('returns an existing active entry for the same customer/service preference', async () => {
    customerFindFirst.mockResolvedValue({ id: 'customer-1' });
    serviceFindFirst.mockResolvedValue({ id: 'service-1' });
    queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'waitlist-1',
          customerId: 'customer-1',
          serviceId: 'service-1',
          preferredStaffId: null,
          desiredFrom: new Date('2026-09-20T09:00:00.000Z'),
          desiredTo: new Date('2026-09-20T18:00:00.000Z'),
          preferredTimeStart: null,
          preferredTimeEnd: null,
          timeZone: 'Europe/Istanbul',
          priority: 50,
          contactChannel: 'ANY',
          status: 'WAITING',
          matchedSlotFrom: null,
          matchedSlotTo: null,
          bookedAppointmentId: null,
          note: null,
          expiresAt: null,
          version: 1,
          createdAt: new Date(),
        },
      ]);

    const service = new OperationsWaitlistService(prisma, tenantContext);
    const result = await service.create({
      customerId: '00000000-0000-4000-8000-000000000001',
      serviceId: '00000000-0000-4000-8000-000000000002',
      desiredFrom: new Date('2026-09-20T09:00:00.000Z'),
      desiredTo: new Date('2026-09-20T18:00:00.000Z'),
      timeZone: 'Europe/Istanbul',
      priority: 50,
      contactChannel: 'ANY',
    });

    expect(result.duplicate).toBe(true);
    expect(executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('rejects a preferred staff reference outside the active branch', async () => {
    customerFindFirst.mockResolvedValue({ id: 'customer-1' });
    serviceFindFirst.mockResolvedValue({ id: 'service-1' });
    staffFindFirst.mockResolvedValue(null);
    queryRawUnsafe.mockResolvedValueOnce([]);

    const service = new OperationsWaitlistService(prisma, tenantContext);

    await expect(
      service.create({
        customerId: '00000000-0000-4000-8000-000000000001',
        serviceId: '00000000-0000-4000-8000-000000000002',
        preferredStaffId: '00000000-0000-4000-8000-000000000003',
        desiredFrom: new Date('2026-09-20T09:00:00.000Z'),
        desiredTo: new Date('2026-09-20T18:00:00.000Z'),
        timeZone: 'Europe/Istanbul',
        priority: 50,
        contactChannel: 'ANY',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects stale cancellation versions', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'waitlist-1',
          customerId: 'customer-1',
          serviceId: 'service-1',
          preferredStaffId: null,
          desiredFrom: new Date('2026-09-20T09:00:00.000Z'),
          desiredTo: new Date('2026-09-20T18:00:00.000Z'),
          preferredTimeStart: null,
          preferredTimeEnd: null,
          timeZone: 'Europe/Istanbul',
          priority: 50,
          contactChannel: 'ANY',
          status: 'WAITING',
          matchedSlotFrom: null,
          matchedSlotTo: null,
          bookedAppointmentId: null,
          note: null,
          expiresAt: null,
          version: 2,
          createdAt: new Date(),
        },
      ]);

    const service = new OperationsWaitlistService(prisma, tenantContext);

    await expect(
      service.cancel('waitlist-1', { expectedVersion: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
