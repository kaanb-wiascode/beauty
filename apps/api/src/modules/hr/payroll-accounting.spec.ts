import { BadRequestException } from '@nestjs/common';
import { PayrollAccountingService } from './payroll-accounting.service';

describe('PayrollAccountingService', () => {
  const tenant = {
    getTenantId: () => 'tenant-a',
    getCompanyId: () => 'company-a',
    getBranchId: () => null,
    getRoleScope: () => 'COMPANY',
  } as never;
  const scope = { getAssignedActiveBranchIds: jest.fn().mockResolvedValue(['branch-a', 'branch-b']) } as never;
  const approvalRuntime = { createWithinTransaction: jest.fn() } as never;

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

  it('rejects manual payroll salary item overrides', async () => {
    const prisma = { $transaction: jest.fn() } as never;
    const service = new PayrollAccountingService(prisma, tenant, scope, approvalRuntime);

    await expect(service.upsertItem('period-a', balanced)).rejects.toThrow(
      'Bordro ücret kalemleri manuel olarak oluşturulamaz veya değiştirilemez.',
    );
    expect((prisma as any).$transaction).not.toHaveBeenCalled();
  });

  it('does not post branchless periods for restricted company scope', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const tx = { $queryRawUnsafe: query };
    const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) } as never;
    const service = new PayrollAccountingService(prisma, tenant, scope, approvalRuntime);

    await expect(service.post('period-global')).rejects.toThrow('Bordro dönemi bulunamadı.');
    expect(String(query.mock.calls[0][0])).not.toContain('branch_id IS NULL');
    expect(query.mock.calls[0][4]).toEqual(['branch-a', 'branch-b']);
  });
});
