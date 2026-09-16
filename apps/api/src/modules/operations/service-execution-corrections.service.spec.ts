import { ConflictException } from '@nestjs/common';

import { ServiceExecutionCorrectionsService } from './service-execution-corrections.service';

describe('ServiceExecutionCorrectionsService', () => {
  const queryRawUnsafe = jest.fn();
  const executeRawUnsafe = jest.fn();
  const appointmentFindFirst = jest.fn();
  const tx = {
    $queryRawUnsafe: queryRawUnsafe,
    $executeRawUnsafe: executeRawUnsafe,
    appointment: { findFirst: appointmentFindFirst },
  } as never;
  const prisma = {
    $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
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
    appointmentFindFirst.mockReset();
  });

  it('blocks completion reversal after appointment completion', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'execution-1',
          appointmentId: 'appointment-1',
          visitId: 'visit-1',
          status: 'COMPLETED',
          version: 2,
        },
      ]);
    appointmentFindFirst.mockResolvedValue({ status: 'COMPLETED' });

    const service = new ServiceExecutionCorrectionsService(prisma, tenantContext);

    await expect(
      service.reverseCompletion('execution-1', {
        expectedVersion: 2,
        reasonCode: 'ENTRY_ERROR',
        reasonLabel: 'Yanlış tamamlandı',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks completion reversal after inventory posting', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'execution-1',
          appointmentId: 'appointment-1',
          visitId: 'visit-1',
          status: 'COMPLETED',
          version: 2,
        },
      ])
      .mockResolvedValueOnce([{ id: 'movement-1' }]);
    appointmentFindFirst.mockResolvedValue({ status: 'CONFIRMED' });

    const service = new ServiceExecutionCorrectionsService(prisma, tenantContext);

    await expect(
      service.reverseCompletion('execution-1', {
        expectedVersion: 2,
        reasonCode: 'SERVICE_REDO',
        reasonLabel: 'Hizmet yeniden yapılacak',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('cancels an in-progress execution and closes active staff assignments', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'execution-1',
          appointmentId: 'appointment-1',
          visitId: 'visit-1',
          status: 'IN_PROGRESS',
          version: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'execution-1',
          appointmentId: 'appointment-1',
          visitId: 'visit-1',
          status: 'CANCELLED',
          version: 2,
        },
      ]);

    const service = new ServiceExecutionCorrectionsService(prisma, tenantContext);
    const result = await service.cancel('execution-1', {
      expectedVersion: 1,
      reasonCode: 'CUSTOMER_REQUEST',
      reasonLabel: 'Müşteri talebi',
    });

    expect(result.execution.status).toBe('CANCELLED');
    expect(result.restartAllowed).toBe(true);
    expect(executeRawUnsafe).toHaveBeenCalledTimes(3);
  });
});
