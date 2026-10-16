import { BadRequestException, ConflictException } from '@nestjs/common';

import { OperationsBranchChecklistsService } from './operations-branch-checklists.service';

describe('OperationsBranchChecklistsService', () => {
  const queryRawUnsafe = jest.fn();
  const executeRawUnsafe = jest.fn();
  const transaction = jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      $queryRawUnsafe: queryRawUnsafe,
      $executeRawUnsafe: executeRawUnsafe,
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
    transaction.mockClear();
  });

  it('starts the same daily category idempotently when a run already exists', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'run-1',
          category: 'OPENING',
          templateName: 'Şube Açılışı',
          templateVersion: 2,
          businessDate: new Date('2026-09-15T00:00:00.000Z'),
          status: 'OPEN',
          startedAt: new Date(),
          completedAt: null,
          version: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'run-1',
          category: 'OPENING',
          templateName: 'Şube Açılışı',
          templateVersion: 2,
          businessDate: new Date('2026-09-15T00:00:00.000Z'),
          status: 'OPEN',
          startedAt: new Date(),
          completedAt: null,
          version: 1,
        },
      ])
      .mockResolvedValueOnce([]);

    const service = new OperationsBranchChecklistsService(prisma, tenantContext);
    const result = await service.startRun({
      category: 'OPENING',
      businessDate: new Date('2026-09-15T00:00:00.000Z'),
    });

    expect(result.id).toBe('run-1');
    expect(executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('does not allow required items to be marked NA', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([
        {
          id: 'run-1',
          category: 'OPENING',
          templateName: 'Şube Açılışı',
          templateVersion: 1,
          businessDate: new Date(),
          status: 'OPEN',
          startedAt: new Date(),
          completedAt: null,
          version: 1,
        },
      ])
      .mockResolvedValueOnce([
        { id: 'item-1', itemCode: 'CASH_READY', isRequired: true, version: 1 },
      ]);

    const service = new OperationsBranchChecklistsService(prisma, tenantContext);

    await expect(
      service.updateItem('run-1', 'item-1', {
        expectedVersion: 1,
        status: 'NA',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects completion while required checklist items remain incomplete', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'run-1',
          category: 'CLOSING',
          templateName: 'Şube Kapanışı',
          templateVersion: 1,
          businessDate: new Date(),
          status: 'OPEN',
          startedAt: new Date(),
          completedAt: null,
          version: 3,
        },
      ])
      .mockResolvedValueOnce([{ count: 2 }]);

    const service = new OperationsBranchChecklistsService(prisma, tenantContext);

    await expect(
      service.completeRun('run-1', { expectedVersion: 3 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects stale run completion versions', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'run-1',
          category: 'OPENING',
          templateName: 'Şube Açılışı',
          templateVersion: 1,
          businessDate: new Date(),
          status: 'OPEN',
          startedAt: new Date(),
          completedAt: null,
          version: 2,
        },
      ]);

    const service = new OperationsBranchChecklistsService(prisma, tenantContext);

    await expect(
      service.completeRun('run-1', { expectedVersion: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
