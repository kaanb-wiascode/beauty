import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PayrollAccountingService } from './payroll-accounting.service';

describe('PayrollAccountingService', () => {
  const tenant = {
    getTenantId: () => 'tenant-a',
    getCompanyId: () => 'company-a',
    getBranchId: () => null,
    getRoleScope: () => 'COMPANY',
  } as never;
  const scope = { getAssignedActiveBranchIds: jest.fn().mockResolvedValue(['branch-a', 'branch-b']) } as never;

  const balanced = {
    staffId: 'staff-a',
    branchId: 'branch-a',
    grossAmount: 10000,
    netAmount: 7400,
    incomeTax: 1000,
    stampTax: 100,
    employeeSocialSecurity: 1400,
    unemploymentEmployee: 100,
    employerSocialSecurity: 2050,
    unemploymentEmployer: 200,
    otherDeductions: 0,
    employerCost: 12250,
  };

  it('rejects a payroll item when net pay does not reconcile', async () => {
    const prisma = { $transaction: jest.fn() } as never;
    const service = new PayrollAccountingService(prisma, tenant, scope);
    await expect(service.upsertItem('period-a', { ...balanced, netAmount: 9000 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an item branch outside assigned company branches', async () => {
    const prisma = { $transaction: jest.fn() } as never;
    const service = new PayrollAccountingService(prisma, tenant, scope);
    await expect(
      service.upsertItem('period-a', { ...balanced, branchId: 'branch-c' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect((prisma as any).$transaction).not.toHaveBeenCalled();
  });

  it('accepts a balanced payroll item only when period branch matches active scope', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'period-a', status: 'DRAFT', branchId: 'branch-a' }])
      .mockResolvedValueOnce([{ id: 'item-a' }]);
    const tx = {
      $queryRawUnsafe: query,
      staff: { findFirst: jest.fn().mockResolvedValue({ id: 'staff-a' }) },
    };
    const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) } as never;
    const service = new PayrollAccountingService(prisma, tenant, scope);

    await expect(service.upsertItem('period-a', balanced)).resolves.toEqual({ id: 'item-a' });
    expect(String(query.mock.calls[0][0])).toContain('branch_id=ANY($4::text[])');
    expect(query.mock.calls[0].slice(1)).toEqual([
      'period-a',
      'tenant-a',
      'company-a',
      ['branch-a', 'branch-b'],
    ]);
  });

  it('does not post branchless periods for restricted company scope', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const tx = { $queryRawUnsafe: query };
    const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) } as never;
    const service = new PayrollAccountingService(prisma, tenant, scope);

    await expect(service.post('period-global')).rejects.toThrow('Payroll period not found.');
    expect(String(query.mock.calls[0][0])).not.toContain('branch_id IS NULL');
    expect(query.mock.calls[0][4]).toEqual(['branch-a', 'branch-b']);
  });
});
