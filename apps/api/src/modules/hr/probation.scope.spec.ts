import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProbationService } from './probation.service';

describe('ProbationService organization scope', () => {
  const ctx = {
    getTenantId: () => 'tenant-a',
    getCompanyId: () => 'company-a',
  } as never;

  it('supports COMPANY users across assigned branches', async () => {
    const organizationScope = {
      getBranchScopedWhere: jest.fn().mockResolvedValue({ tenantId: 'tenant-a', branchId: { in: ['branch-a', 'branch-b'] } }),
    } as never;
    const staffFind = jest.fn().mockResolvedValue({ id: 'staff-b', status: 'ACTIVE', branchId: 'branch-b', branch: { companyId: 'company-a' } });
    const query = jest.fn().mockResolvedValueOnce([]);
    const prisma = { staff: { findFirst: staffFind }, $queryRawUnsafe: query } as never;
    const service = new ProbationService(prisma, ctx, organizationScope);

    await expect(service.get('staff-b')).resolves.toEqual({ periods: [], current: null, reviews: [] });
    expect(staffFind.mock.calls[0][0].where.branchId).toEqual({ in: ['branch-a', 'branch-b'] });
    expect(query.mock.calls[0].slice(1)).toEqual(['tenant-a', 'company-a', 'branch-b', 'staff-b']);
  });

  it('hides staff outside organization scope', async () => {
    const organizationScope = {
      getBranchScopedWhere: jest.fn().mockResolvedValue({ tenantId: 'tenant-a', branchId: { in: ['branch-a'] } }),
    } as never;
    const prisma = { staff: { findFirst: jest.fn().mockResolvedValue(null) }, $queryRawUnsafe: jest.fn() } as never;
    const service = new ProbationService(prisma, ctx, organizationScope);

    await expect(service.get('staff-b')).rejects.toBeInstanceOf(NotFoundException);
    expect((prisma as any).$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('requires reviewer to be active in the employee branch', async () => {
    const organizationScope = {
      getBranchScopedWhere: jest.fn().mockResolvedValue({ tenantId: 'tenant-a', branchId: { in: ['branch-a', 'branch-b'] } }),
    } as never;
    const staffFind = jest.fn()
      .mockResolvedValueOnce({ id: 'staff-a', status: 'ACTIVE', branchId: 'branch-a', branch: { companyId: 'company-a' } })
      .mockResolvedValueOnce(null);
    const prisma = { staff: { findFirst: staffFind }, $transaction: jest.fn() } as never;
    const service = new ProbationService(prisma, ctx, organizationScope);

    await expect(service.start('staff-a', { reviewerStaffId: 'reviewer-b' }, 'user-a')).rejects.toBeInstanceOf(BadRequestException);
    expect(staffFind.mock.calls[1][0].where).toMatchObject({ id: 'reviewer-b', branchId: 'branch-a', status: 'ACTIVE' });
    expect((prisma as any).$transaction).not.toHaveBeenCalled();
  });

  it('revalidates probation branch inside review transaction', async () => {
    const organizationScope = {
      getBranchScopedWhere: jest.fn().mockResolvedValue({ tenantId: 'tenant-a', branchId: { in: ['branch-a'] } }),
    } as never;
    const txQuery = jest.fn().mockResolvedValueOnce([]);
    const prisma: any = {
      staff: { findFirst: jest.fn().mockResolvedValue({ id: 'staff-a', status: 'ACTIVE', branchId: 'branch-a', branch: { companyId: 'company-a' } }) },
      $transaction: jest.fn(async (fn: any) => fn({ $queryRawUnsafe: txQuery, $executeRawUnsafe: jest.fn() })),
    };
    const service = new ProbationService(prisma, ctx, organizationScope);

    await expect(service.review('staff-a', 'review-a', { status: 'COMPLETED', rating: 5 }, 'user-a')).rejects.toBeInstanceOf(NotFoundException);
    expect(String(txQuery.mock.calls[0][0])).toContain('p.company_id=$3');
    expect(String(txQuery.mock.calls[0][0])).toContain('p.branch_id=$4');
    expect(txQuery.mock.calls[0].slice(1)).toEqual(['review-a', 'tenant-a', 'company-a', 'branch-a', 'staff-a']);
  });
});
