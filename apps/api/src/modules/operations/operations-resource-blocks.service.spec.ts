import { ConflictException } from '@nestjs/common';

import { OperationsResourceBlocksService } from './operations-resource-blocks.service';

describe('OperationsResourceBlocksService', () => {
  const queryRawUnsafe = jest.fn();
  const transaction = jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({ $queryRawUnsafe: queryRawUnsafe }),
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
    transaction.mockClear();
  });

  it('rejects a block that overlaps an existing reservation', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'room-1' }])
      .mockResolvedValueOnce([
        {
          appointmentId: 'appointment-1',
          blockedFrom: new Date('2026-09-15T09:00:00.000Z'),
          blockedTo: new Date('2026-09-15T10:00:00.000Z'),
        },
      ]);

    const service = new OperationsResourceBlocksService(prisma, tenantContext);

    await expect(
      service.create({
        roomId: '00000000-0000-4000-8000-000000000001',
        blockedFrom: new Date('2026-09-15T09:30:00.000Z'),
        blockedTo: new Date('2026-09-15T10:30:00.000Z'),
        reason: 'Deep cleaning',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns the existing exact active block idempotently', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'room-1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'block-1' }])
      .mockResolvedValueOnce([
        {
          id: 'block-1',
          roomId: 'room-1',
          assetId: null,
          blockedFrom: new Date('2026-09-15T09:00:00.000Z'),
          blockedTo: new Date('2026-09-15T10:00:00.000Z'),
          reason: 'Deep cleaning',
          status: 'ACTIVE',
          version: 1,
        },
      ]);

    const service = new OperationsResourceBlocksService(prisma, tenantContext);
    const result = await service.create({
      roomId: '00000000-0000-4000-8000-000000000001',
      blockedFrom: new Date('2026-09-15T09:00:00.000Z'),
      blockedTo: new Date('2026-09-15T10:00:00.000Z'),
      reason: 'Deep cleaning',
    });

    expect(result).toMatchObject({ id: 'block-1', status: 'ACTIVE' });
  });

  it('rejects stale or already cancelled block cancellation', async () => {
    queryRawUnsafe.mockResolvedValueOnce([]);

    const service = new OperationsResourceBlocksService(prisma, tenantContext);

    await expect(
      service.cancel('00000000-0000-4000-8000-000000000001', {
        expectedVersion: 2,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
