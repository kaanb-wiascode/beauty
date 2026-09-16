import { ConflictException } from '@nestjs/common';

import { OperationsWaitlistMatchingService } from './operations-waitlist-matching.service';

describe('OperationsWaitlistMatchingService', () => {
  const queryRawUnsafe = jest.fn();
  const executeRawUnsafe = jest.fn();
  const staffFindFirst = jest.fn();
  const appointmentFindFirst = jest.fn();
  const appointmentCreate = jest.fn();
  const transaction = jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      $queryRawUnsafe: queryRawUnsafe,
      $executeRawUnsafe: executeRawUnsafe,
      staff: { findFirst: staffFindFirst },
      appointment: { findFirst: appointmentFindFirst, create: appointmentCreate },
    }),
  );
  const prisma = {
    $queryRawUnsafe: queryRawUnsafe,
    $executeRawUnsafe: executeRawUnsafe,
    $transaction: transaction,
  } as never;
  const tenantContext = {
    getTenantId: () => 'tenant-1',
    getCompanyId: () => 'company-1',
    getBranchId: () => 'branch-1',
    getMembershipId: () => 'membership-1',
  } as never;

  const target = {
    id: 'waitlist-1',
    customerId: 'customer-1',
    serviceId: 'service-1',
    preferredStaffId: null,
    desiredFrom: new Date('2026-09-20T06:00:00.000Z'),
    desiredTo: new Date('2026-09-20T16:00:00.000Z'),
    preferredTimeStart: '09:00:00',
    preferredTimeEnd: '18:00:00',
    timeZone: 'Europe/Istanbul',
    status: 'WAITING',
    expiresAt: null,
    version: 1,
    durationMinutes: 60,
    roomType: null,
    requiredAssetType: null,
    requiredAssetId: null,
    prepDurationMinutes: 0,
    cleanupDurationMinutes: 0,
  };

  beforeEach(() => {
    queryRawUnsafe.mockReset();
    executeRawUnsafe.mockReset();
    staffFindFirst.mockReset();
    appointmentFindFirst.mockReset();
    appointmentCreate.mockReset();
    transaction.mockClear();
  });

  it('marks a waiting entry as MATCH_FOUND and returns the new optimistic version', async () => {
    const match = {
      staffId: 'staff-1',
      staffName: 'Elif Uzman',
      startAt: new Date('2026-09-20T07:00:00.000Z'),
      endAt: new Date('2026-09-20T08:00:00.000Z'),
      blockedFrom: new Date('2026-09-20T07:00:00.000Z'),
      blockedTo: new Date('2026-09-20T08:00:00.000Z'),
      roomId: null,
      roomName: null,
      assetId: null,
      assetName: null,
    };
    queryRawUnsafe
      .mockResolvedValueOnce([target])
      .mockResolvedValueOnce([match])
      .mockResolvedValueOnce([{ version: 2 }]);

    const service = new OperationsWaitlistMatchingService(prisma, tenantContext);
    const result = await service.findMatches('waitlist-1', { limit: 10 });

    expect(result.entryVersion).toBe(2);
    expect(result.matches).toEqual([match]);
    expect(executeRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it('rejects accepting a stale matched version before creating an appointment', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...target, status: 'MATCH_FOUND', version: 2 }]);

    const service = new OperationsWaitlistMatchingService(prisma, tenantContext);

    await expect(
      service.acceptMatch('waitlist-1', {
        expectedVersion: 1,
        staffId: '00000000-0000-4000-8000-000000000010',
        startAt: new Date('2026-09-20T07:00:00.000Z'),
        endAt: new Date('2026-09-20T08:00:00.000Z'),
        roomId: null,
        assetId: null,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(appointmentCreate).not.toHaveBeenCalled();
  });

  it('rejects accepting a slot when the selected staff has approved leave', async () => {
    const staffId = '00000000-0000-4000-8000-000000000010';
    queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...target, status: 'MATCH_FOUND', version: 1 }])
      .mockResolvedValueOnce([{ id: 'leave-1' }]);
    staffFindFirst.mockResolvedValueOnce({ id: staffId });

    const service = new OperationsWaitlistMatchingService(prisma, tenantContext);

    await expect(
      service.acceptMatch('waitlist-1', {
        expectedVersion: 1,
        staffId,
        startAt: new Date('2026-09-20T07:00:00.000Z'),
        endAt: new Date('2026-09-20T08:00:00.000Z'),
        roomId: null,
        assetId: null,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'STAFF_APPROVED_LEAVE',
        staffId,
      }),
    });

    expect(appointmentFindFirst).not.toHaveBeenCalled();
    expect(appointmentCreate).not.toHaveBeenCalled();
  });
});
