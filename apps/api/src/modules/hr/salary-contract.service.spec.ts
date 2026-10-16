import { BadRequestException } from '@nestjs/common';
import { SalaryContractService } from './salary-contract.service';

describe('SalaryContractService', () => {
  const tenant = {
    getTenantId: () => 'tenant-a',
    getCompanyId: () => 'company-a',
  } as any;

  const organizationScope = {
    getBranchScopedWhere: jest.fn().mockResolvedValue({ branchId: { in: ['branch-a'] } }),
  } as any;

  it('rejects unsupported daily net salary contracts', async () => {
    const prisma = {} as any;
    const service = new SalaryContractService(prisma, tenant, organizationScope);

    await expect(
      service.create(
        'staff-a',
        {
          salaryBasis: 'DAILY_NET',
          netAmount: 1000,
          currency: 'TRY',
          effectiveFrom: '2026-10-01',
        },
        'user-a',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unsupported hourly net salary contracts', async () => {
    const prisma = {} as any;
    const service = new SalaryContractService(prisma, tenant, organizationScope);

    await expect(
      service.create(
        'staff-a',
        {
          salaryBasis: 'HOURLY_NET',
          netAmount: 500,
          currency: 'TRY',
          effectiveFrom: '2026-10-01',
        },
        'user-a',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
