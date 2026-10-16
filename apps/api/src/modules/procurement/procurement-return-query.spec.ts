import { NotFoundException } from '@nestjs/common';
import { ProcurementReturnQueryService } from './procurement-return-query.service';

describe('ProcurementReturnQueryService', () => {
  function createService(query: jest.Mock, branchId: string | null = 'branch-a') {
    const prisma = { $queryRawUnsafe: query } as never;
    const tenant = {
      getTenantId: jest.fn().mockReturnValue('tenant-a'),
      getCompanyId: jest.fn().mockReturnValue('company-a'),
      getBranchId: jest.fn().mockReturnValue(branchId),
    } as never;
    return new ProcurementReturnQueryService(prisma, tenant);
  }

  it('scopes purchase return detail by tenant, company and branch', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const service = createService(query);

    await expect(service.getPurchaseReturnDetail('return-x')).rejects.toBeInstanceOf(NotFoundException);
    expect(String(query.mock.calls[0][0])).toContain('pr.tenant_id=$2::text');
    expect(String(query.mock.calls[0][0])).toContain('pr.company_id=$3::text');
    expect(String(query.mock.calls[0][0])).toContain('pr.branch_id=$4::text');
    expect(query.mock.calls[0].slice(1)).toEqual(['return-x', 'tenant-a', 'company-a', 'branch-a']);
  });

  it('subtracts non-rejected replacement quantities from replaceable quantity', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'return-1', branchId: 'branch-a' }])
      .mockResolvedValueOnce([{ id: 'return-item-1', quantity: 4, replacementQuantity: 1, remainingReplacementQuantity: 3 }]);
    const service = createService(query);

    const result = await service.getPurchaseReturnDetail('return-1');

    expect(result.items[0]).toMatchObject({ remainingReplacementQuantity: 3 });
    expect(String(query.mock.calls[1][0])).toContain("rr.status <> 'REJECTED'");
  });
});
