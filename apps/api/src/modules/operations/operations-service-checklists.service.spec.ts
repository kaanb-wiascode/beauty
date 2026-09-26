import { BadRequestException, ConflictException } from '@nestjs/common';

import { OperationsServiceChecklistsService } from './operations-service-checklists.service';

describe('OperationsServiceChecklistsService', () => {
  const queryRawUnsafe = jest.fn();
  const executeRawUnsafe = jest.fn();
  const serviceFindFirst = jest.fn();
  const transaction = jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      $queryRawUnsafe: queryRawUnsafe,
      $executeRawUnsafe: executeRawUnsafe,
      service: { findFirst: serviceFindFirst },
    }),
  );
  const prisma = {
    $queryRawUnsafe: queryRawUnsafe,
    $transaction: transaction,
    service: { findFirst: serviceFindFirst },
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
    serviceFindFirst.mockReset();
    transaction.mockClear();
  });

  it('returns the existing active version when the definition is unchanged', async () => {
    serviceFindFirst.mockResolvedValue({ id: 'service-1' });
    queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'template-1',
          serviceId: 'service-1',
          name: 'Lazer SOP',
          version: 2,
          isActive: true,
          createdAt: new Date(),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'item-1',
          code: 'PREP',
          title: 'Hazırlık kontrolü',
          description: null,
          sortOrder: 0,
          isRequired: true,
        },
      ]);

    const service = new OperationsServiceChecklistsService(prisma, tenantContext);
    const result = await service.createVersion('service-1', {
      name: 'Lazer SOP',
      items: [
        {
          code: 'PREP',
          title: 'Hazırlık kontrolü',
          isRequired: true,
        },
      ],
    });

    expect(result.duplicate).toBe(true);
    expect(result.version).toBe(2);
    expect(executeRawUnsafe).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO operations_service_checklist_template_items'),
      expect.anything(),
    );
  });

  it('does not allow a required execution item to be marked NA', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'execution-1', status: 'IN_PROGRESS' }])
      .mockResolvedValueOnce([
        {
          id: 'item-1',
          executionId: 'execution-1',
          templateId: 'template-1',
          templateVersion: 1,
          itemCode: 'SAFETY',
          title: 'Güvenlik kontrolü',
          description: null,
          sortOrder: 0,
          isRequired: true,
          status: 'PENDING',
          note: null,
          completedByMembershipId: null,
          completedAt: null,
          version: 1,
        },
      ]);

    const service = new OperationsServiceChecklistsService(prisma, tenantContext);

    await expect(
      service.updateExecutionItem('execution-1', 'item-1', {
        status: 'NA',
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps execution checklist evidence immutable after service completion', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'execution-1', status: 'COMPLETED' }]);

    const service = new OperationsServiceChecklistsService(prisma, tenantContext);

    await expect(
      service.updateExecutionItem('execution-1', 'item-1', {
        status: 'COMPLETED',
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
