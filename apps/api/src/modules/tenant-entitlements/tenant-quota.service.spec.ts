import { ConflictException } from '@nestjs/common';

import { TenantQuotaService } from './tenant-quota.service';

describe('TenantQuotaService', () => {
  const createService = () => new TenantQuotaService({} as never);

  it('does not block an unconfigured legacy tenant using DEFAULT quota', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ effectiveValue: 10, source: 'DEFAULT' }]),
      membership: { findFirst: jest.fn() },
    } as any;

    await expect(
      createService().assertUserActivationAllowed('tenant-1', 'user-1', tx),
    ).resolves.toBeUndefined();
    expect(tx.membership.findFirst).not.toHaveBeenCalled();
  });

  it('does not consume a second seat for an already active tenant user', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ effectiveValue: 1, source: 'PLAN' }]),
      membership: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing-membership' }),
      },
    } as any;

    await expect(
      createService().assertUserActivationAllowed('tenant-1', 'user-1', tx),
    ).resolves.toBeUndefined();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('rejects a new distinct active user when the configured limit is reached', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ effectiveValue: 2, source: 'PLAN' }])
        .mockResolvedValueOnce([{ count: 2n }]),
      membership: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any;

    await expect(
      createService().assertUserActivationAllowed('tenant-1', 'user-3', tx),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects branch activation when the configured tenant branch limit is reached', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ effectiveValue: 1, source: 'OVERRIDE' }])
        .mockResolvedValueOnce([{ count: 1n }]),
      branch: {
        findFirst: jest.fn().mockResolvedValue({ status: 'INACTIVE' }),
      },
    } as any;

    await expect(
      createService().assertBranchActivationAllowed('tenant-1', 'branch-2', tx),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
