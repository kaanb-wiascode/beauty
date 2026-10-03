import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { BreakGlassService } from './break-glass.service';

const context = {
  tenantId: 'tenant-1',
  companyId: 'company-1',
  membershipId: 'membership-1',
  branchId: null,
  roleScope: 'CENTRAL',
};

describe('BreakGlassService', () => {
  it('denies break-glass to non-central memberships', async () => {
    const prisma = {
      membership: {
        findFirst: jest.fn().mockResolvedValue({
          userId: 'user-1',
          role: { scope: 'BRANCH' },
        }),
      },
    } as unknown as PrismaService;
    const tenantContext = { getContext: () => ({ ...context, branchId: 'branch-1', roleScope: 'BRANCH' }) } as unknown as TenantContext;
    const redis = { set: jest.fn() } as unknown as RedisService;
    const config = {} as ConfigService;
    const audit = { record: jest.fn() } as unknown as PlatformAuditService;
    const service = new BreakGlassService(prisma, tenantContext, redis, config, audit);

    await expect(service.reauthenticate('password', '123456')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(redis.set).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('does not create a grant when re-authentication proof is missing or already consumed', async () => {
    const executeRaw = jest.fn();
    const prisma = {
      membership: {
        findFirst: jest.fn().mockResolvedValue({
          userId: 'user-1',
          role: { scope: 'CENTRAL' },
        }),
      },
      $executeRaw: executeRaw,
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    const tenantContext = { getContext: () => context } as unknown as TenantContext;
    const redis = { getAndDelete: jest.fn().mockResolvedValue(null) } as unknown as RedisService;
    const config = {} as ConfigService;
    const audit = { record: jest.fn() } as unknown as PlatformAuditService;
    const service = new BreakGlassService(prisma, tenantContext, redis, config, audit);

    await expect(service.activate({
      proofId: '00000000-0000-0000-0000-000000000001',
      permissionId: '00000000-0000-0000-0000-000000000002',
      durationMinutes: 15,
      reason: 'Emergency production recovery',
    })).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
