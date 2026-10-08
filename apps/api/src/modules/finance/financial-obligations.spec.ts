import { BadRequestException } from '@nestjs/common';
import { FinancialObligationRulesService } from './financial-obligation-rules.service';
import { FinancialObligationsService } from './financial-obligations.service';

const tenant = {
  getTenantId: jest.fn(() => 'tenant-1'),
  getCompanyId: jest.fn(() => 'company-1'),
  getBranchId: jest.fn(() => 'branch-1'),
};

describe('Financial obligations', () => {
  it('rejects invalid lifecycle jumps', async () => {
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValueOnce([{ status: 'DRAFT' }]),
      $executeRawUnsafe: jest.fn(),
    };
    const prisma = {
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const service = new FinancialObligationsService(prisma as never, tenant as never);

    await expect(service.transition('obligation-1', 'PAID')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('generates monthly periods with month-end clamping and idempotent skips', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValueOnce([
        {
          id: 'rule-1',
          branchId: 'branch-1',
          name: 'Rent',
          obligationType: 'RENT',
          counterparty: 'Landlord',
          amount: 1000,
          currency: 'TRY',
          frequency: 'MONTHLY',
          intervalCount: 1,
          dayOfMonth: 31,
          startDate: new Date('2027-01-31T00:00:00Z'),
          endDate: null,
          priority: 'HIGH',
          costCenterId: null,
          categoryId: null,
          description: null,
          isActive: true,
        },
      ]),
      $executeRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0),
    };
    const service = new FinancialObligationRulesService(prisma as never, tenant as never);
    const result = await service.generate(
      'rule-1',
      new Date('2027-01-01T00:00:00Z'),
      new Date('2027-03-31T00:00:00Z'),
      'actor-1',
    );

    expect(result).toEqual({ generated: 2, skipped: 1, occurrences: 3 });
    const periodKeys = prisma.$executeRawUnsafe.mock.calls.map((call: any[]) => call[6]);
    expect(periodKeys).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
  });
});
