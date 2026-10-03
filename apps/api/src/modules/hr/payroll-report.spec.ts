import { NotFoundException } from '@nestjs/common';
import { PayrollReportService } from './payroll-report.service';

describe('PayrollReportService', () => {
  const tenant = { getCompanyId: () => 'company-1' } as never;

  it('keeps payroll period lookup inside assigned company branches', async () => {
    const prisma = { $queryRawUnsafe: jest.fn().mockResolvedValueOnce([]) } as never;
    const organizationScope = {
      getBranchScopedWhere: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        branchId: { in: ['branch-1', 'branch-2'] },
      }),
    } as never;
    const service = new PayrollReportService(prisma, tenant, organizationScope);

    await expect(service.period('period-1')).rejects.toBeInstanceOf(NotFoundException);

    const call = (prisma as any).$queryRawUnsafe.mock.calls[0];
    expect(String(call[0])).toContain('branch_id=ANY($4::text[])');
    expect(call.slice(1)).toEqual([
      'period-1',
      'tenant-1',
      'company-1',
      ['branch-1', 'branch-2'],
    ]);
    expect((prisma as any).$queryRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it('uses the resolved period branch for all subordinate report queries', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'period-1', branchId: 'branch-2' }])
      .mockResolvedValueOnce([{ employeeCount: 1 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{}]);
    const prisma = { $queryRawUnsafe: query } as never;
    const organizationScope = {
      getBranchScopedWhere: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        branchId: { in: ['branch-1', 'branch-2'] },
      }),
    } as never;
    const service = new PayrollReportService(prisma, tenant, organizationScope);

    await service.period('period-1');

    for (const call of query.mock.calls.slice(1)) {
      expect(call[4]).toBe('branch-2');
    }
  });
});
