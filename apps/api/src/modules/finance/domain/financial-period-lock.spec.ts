import { BadRequestException } from '@nestjs/common';
import { assertFinancialPeriodOpen } from './financial-period-lock';

describe('assertFinancialPeriodOpen', () => {
  const input = {
    tenantId: 'tenant-1',
    companyId: 'company-1',
    branchId: 'branch-1',
    date: new Date('2026-09-29T12:00:00.000Z'),
  };

  it('allows writes when no matching period exists', async () => {
    const tx = { $queryRawUnsafe: jest.fn().mockResolvedValue([]) };
    await expect(assertFinancialPeriodOpen(tx as never, input)).resolves.toBeUndefined();
  });

  it('allows writes when the matching period is open', async () => {
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([
        { id: 'period-1', name: 'Eylül 2026', status: 'OPEN' },
      ]),
    };
    await expect(assertFinancialPeriodOpen(tx as never, input)).resolves.toBeUndefined();
  });

  it('blocks writes when the matching period is closed', async () => {
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([
        { id: 'period-1', name: 'Eylül 2026', status: 'CLOSED' },
      ]),
    };

    await expect(assertFinancialPeriodOpen(tx as never, input)).rejects.toThrow(
      new BadRequestException(
        'Bu işlem tarihi kapalı finansal döneme aittir: Eylül 2026. Dönem yeniden açılmadan finansal kayıt değiştirilemez.',
      ),
    );
  });

  it('passes branch scope and transaction date to the database check', async () => {
    const tx = { $queryRawUnsafe: jest.fn().mockResolvedValue([]) };
    await assertFinancialPeriodOpen(tx as never, input);

    expect(tx.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(tx.$queryRawUnsafe.mock.calls[0].slice(-4)).toEqual([
      input.tenantId,
      input.companyId,
      input.branchId,
      input.date,
    ]);
  });
});
