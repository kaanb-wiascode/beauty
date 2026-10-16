import { BadRequestException } from '@nestjs/common';
import { CompensationRequestService } from './compensation-request.service';

describe('CompensationRequestService', () => {
  const tenant = {
    getTenantId: () => 'tenant-a',
    getCompanyId: () => 'company-a',
  } as any;

  const organizationScope = {
    getBranchScopedWhere: jest.fn().mockResolvedValue({ branchId: { in: ['branch-a'] } }),
  } as any;

  const approvalRuntime = {
    createWithinTransaction: jest.fn().mockResolvedValue({ id: 'approval-a' }),
  } as any;

  it('rejects unsupported compensation type', async () => {
    const prisma = {} as any;
    const service = new CompensationRequestService(prisma, tenant, organizationScope, approvalRuntime);

    await expect(
      service.create(
        { staffId: 'staff-a', type: 'OTHER', amount: 1000, year: 2026, month: 10, reason: 'test' },
        'user-a',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates compensation request and central approval atomically', async () => {
    const rawQuery = jest.fn()
      .mockResolvedValueOnce([{ id: 'staff-a', branchId: 'branch-a' }])
      .mockResolvedValueOnce([{
        id: 'comp-a',
        branchId: 'branch-a',
        staffId: 'staff-a',
        type: 'BONUS',
        amount: '1250',
        currency: 'TRY',
        year: 2026,
        month: 10,
        reason: 'Hedef primi',
        status: 'PENDING',
      }]);
    const taggedQuery = jest.fn()
      .mockResolvedValueOnce([{ locked: 1 }])
      .mockResolvedValueOnce([{ id: 'workflow-a' }]);
    const execute = jest.fn().mockResolvedValue(1);
    const tx = {
      $queryRawUnsafe: rawQuery,
      $queryRaw: taggedQuery,
      $executeRawUnsafe: execute,
    };
    const prisma = {
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    } as any;
    const service = new CompensationRequestService(prisma, tenant, organizationScope, approvalRuntime);

    await expect(
      service.create(
        { staffId: 'staff-a', type: 'BONUS', amount: 1250, year: 2026, month: 10, reason: 'Hedef primi' },
        'user-a',
      ),
    ).resolves.toEqual(expect.objectContaining({
      id: 'comp-a',
      approvalRequestId: 'approval-a',
      status: 'PENDING',
    }));

    expect(approvalRuntime.createWithinTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowKey: 'hr.compensation-request-approval',
        entityType: 'hr_compensation_request',
        entityId: 'comp-a',
        branchId: 'branch-a',
        payload: expect.objectContaining({ staffId: 'staff-a', type: 'BONUS', amount: 1250 }),
      }),
      tx,
    );
    expect(execute).toHaveBeenCalled();
  });
});
