import { BadRequestException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import {
  PlatformAuditService,
  redactPlatformAuditPayload,
} from './platform-audit.service';

describe('PlatformAuditService', () => {
  const queryRaw = jest.fn();
  const prisma = {
    $queryRaw: queryRaw,
  } as unknown as PrismaService;
  const service = new PlatformAuditService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redacts nested secrets while preserving non-sensitive audit context', () => {
    expect(
      redactPlatformAuditPayload({
        plan: 'ENTERPRISE',
        accessToken: 'token-value',
        nested: {
          passwordHash: 'hash-value',
          safe: 'visible',
        },
        items: [{ api_key: 'secret-key', id: 'item-1' }],
      }),
    ).toEqual({
      plan: 'ENTERPRISE',
      accessToken: '[REDACTED]',
      nested: {
        passwordHash: '[REDACTED]',
        safe: 'visible',
      },
      items: [{ api_key: '[REDACTED]', id: 'item-1' }],
    });
  });

  it('writes a redacted append-only audit event with target and correlation context', async () => {
    queryRaw.mockResolvedValue([
      { id: 'audit-1', createdAt: new Date('2026-09-15T14:30:00.000Z') },
    ]);

    await expect(
      service.record({
        actorUserId: ' platform-user-1 ',
        resource: ' tenants ',
        action: ' update ',
        targetTenantId: 'tenant-1',
        targetEntityType: 'Tenant',
        targetEntityId: 'tenant-1',
        reason: 'Contract amendment',
        beforeState: { plan: 'PRO', secret: 'before-secret' },
        afterState: { plan: 'ENTERPRISE', accessToken: 'after-token' },
        metadata: { ticketId: 'T-1842', authorization: 'Bearer value' },
        correlationId: 'corr-1',
      }),
    ).resolves.toEqual({
      id: 'audit-1',
      createdAt: new Date('2026-09-15T14:30:00.000Z'),
    });

    expect(queryRaw).toHaveBeenCalledTimes(1);
    const serializedCall = JSON.stringify(queryRaw.mock.calls[0]);
    expect(serializedCall).toContain('platform-user-1');
    expect(serializedCall).toContain('tenant-1');
    expect(serializedCall).toContain('corr-1');
    expect(serializedCall).toContain('[REDACTED]');
    expect(serializedCall).not.toContain('before-secret');
    expect(serializedCall).not.toContain('after-token');
    expect(serializedCall).not.toContain('Bearer value');
  });

  it('uses the supplied transaction client for atomic audit writes', async () => {
    const transactionQueryRaw = jest.fn().mockResolvedValue([
      { id: 'audit-tx', createdAt: new Date('2026-09-15T14:31:00.000Z') },
    ]);

    await service.record(
      {
        actorUserId: 'user-1',
        resource: 'roles',
        action: 'update',
        targetTenantId: 'tenant-1',
      },
      { $queryRaw: transactionQueryRaw } as never,
    );

    expect(transactionQueryRaw).toHaveBeenCalledTimes(1);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('reads audit events only through an explicit tenant predicate and bounded filters', async () => {
    queryRaw.mockResolvedValue([]);

    await service.findTenantEvents(' tenant-1 ', {
      resource: ' roles ',
      action: ' update ',
      companyId: 'company-1',
      branchId: 'branch-1',
      limit: 500,
    });

    expect(queryRaw).toHaveBeenCalledTimes(1);
    const serializedCall = JSON.stringify(queryRaw.mock.calls[0]);
    expect(serializedCall).toContain('tenant-1');
    expect(serializedCall).toContain('roles');
    expect(serializedCall).toContain('update');
    expect(serializedCall).toContain('company-1');
    expect(serializedCall).toContain('branch-1');
    expect(serializedCall).toContain('200');
  });

  it('rejects an invalid tenant audit date range before querying', async () => {
    await expect(
      service.findTenantEvents('tenant-1', {
        from: new Date('2026-09-16T00:00:00.000Z'),
        to: new Date('2026-09-15T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('rejects incomplete audit identity and action context', async () => {
    await expect(
      service.record({
        actorUserId: ' ',
        resource: 'tenants',
        action: 'update',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(queryRaw).not.toHaveBeenCalled();
  });
});
