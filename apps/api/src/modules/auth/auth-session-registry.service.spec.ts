import { NotFoundException } from '@nestjs/common';

import { RedisService } from '../../infrastructure/redis/redis.service';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { AuthSessionRegistryService } from './auth-session-registry.service';

describe('AuthSessionRegistryService', () => {
  const values = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const ttl = jest.fn().mockResolvedValue(3600);
  const del = jest.fn(async (key: string) => {
    const existed = values.delete(key);
    return existed ? 1 : 0;
  });
  const sAdd = jest.fn(async (key: string, value: string) => {
    const set = sets.get(key) ?? new Set<string>();
    set.add(value);
    sets.set(key, set);
    return 1;
  });
  const sRem = jest.fn(async (key: string, value: string) => {
    const set = sets.get(key);
    if (!set) return 0;
    const removed = set.delete(value);
    return removed ? 1 : 0;
  });
  const sMembers = jest.fn(async (key: string) => [...(sets.get(key) ?? [])]);
  const expire = jest.fn().mockResolvedValue(true);
  const auditRecord = jest.fn().mockResolvedValue({ id: 'audit-1' });

  const redis = {
    set: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    get: jest.fn(async (key: string) => values.get(key) ?? null),
    delete: jest.fn(async (key: string) => {
      values.delete(key);
    }),
    getClient: () => ({ ttl, del, sAdd, sRem, sMembers, expire }),
  } as unknown as RedisService;

  const audit = { record: auditRecord } as unknown as PlatformAuditService;
  const service = new AuthSessionRegistryService(redis, audit);

  beforeEach(() => {
    values.clear();
    sets.clear();
    jest.clearAllMocks();
    ttl.mockResolvedValue(3600);
    expire.mockResolvedValue(true);
    auditRecord.mockResolvedValue({ id: 'audit-1' });
  });

  it('registers a session without exposing the refresh identifier', async () => {
    const result = await service.register({
      refreshId: '00000000-0000-4000-8000-000000000001',
      userId: 'user-1',
      tenantId: 'tenant-1',
      membershipId: 'membership-1',
      companyId: 'company-1',
      branchId: null,
      roleScope: 'CENTRAL',
    });

    expect(result.id).toMatch(/^[a-f0-9]{64}$/);
    expect(result).not.toHaveProperty('refreshId');
    expect(values.get(`auth:session:${result.id}`)).toContain('00000000-0000-4000-8000-000000000001');
  });

  it('rotates the public session fingerprint with the refresh session', async () => {
    const first = await service.register({
      refreshId: '00000000-0000-4000-8000-000000000001',
      userId: 'user-1',
      tenantId: 'tenant-1',
      membershipId: 'membership-1',
      companyId: 'company-1',
      branchId: 'branch-1',
      roleScope: 'BRANCH',
    });

    const next = await service.rotate(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    );

    expect(next?.id).not.toBe(first.id);
    expect(values.has(`auth:session:${first.id}`)).toBe(false);
    expect(values.has(`auth:session:${next?.id}`)).toBe(true);
  });

  it('revokes only a session owned by the current user and tenant', async () => {
    const session = await service.register({
      refreshId: '00000000-0000-4000-8000-000000000003',
      userId: 'user-1',
      tenantId: 'tenant-1',
      membershipId: 'membership-1',
      companyId: 'company-1',
      branchId: null,
      roleScope: 'COMPANY',
    });

    await expect(
      service.revoke(session.id, 'other-user', 'tenant-1'),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.revoke(session.id, 'user-1', 'tenant-1'),
    ).resolves.toEqual({ id: session.id, revoked: true });

    expect(del).toHaveBeenCalledWith(
      'auth:refresh:00000000-0000-4000-8000-000000000003',
    );
    expect(auditRecord).toHaveBeenCalledTimes(1);
  });

  it('revokes every registered session for the current user', async () => {
    await service.register({
      refreshId: '00000000-0000-4000-8000-000000000010',
      userId: 'user-1',
      tenantId: 'tenant-1',
      membershipId: 'membership-1',
      companyId: 'company-1',
      branchId: null,
      roleScope: 'COMPANY',
    });
    await service.register({
      refreshId: '00000000-0000-4000-8000-000000000011',
      userId: 'user-1',
      tenantId: 'tenant-1',
      membershipId: 'membership-1',
      companyId: 'company-2',
      branchId: null,
      roleScope: 'COMPANY',
    });

    await expect(
      service.revokeAll({
        actorUserId: 'user-1',
        targetUserId: 'user-1',
        tenantId: 'tenant-1',
      }),
    ).resolves.toEqual({ revokedCount: 2 });

    expect(await service.list('user-1', 'tenant-1')).toHaveLength(0);
    expect(auditRecord).toHaveBeenCalledTimes(1);
  });

  it('lets an administrator revoke only sessions in the active company', async () => {
    const companySession = await service.register({
      refreshId: '00000000-0000-4000-8000-000000000020',
      userId: 'target-user',
      tenantId: 'tenant-1',
      membershipId: 'membership-company-1',
      companyId: 'company-1',
      branchId: null,
      roleScope: 'COMPANY',
    });
    const otherCompanySession = await service.register({
      refreshId: '00000000-0000-4000-8000-000000000021',
      userId: 'target-user',
      tenantId: 'tenant-1',
      membershipId: 'membership-company-2',
      companyId: 'company-2',
      branchId: null,
      roleScope: 'COMPANY',
    });

    await expect(
      service.revokeForAdmin({
        id: otherCompanySession.id,
        actorUserId: 'admin-user',
        targetUserId: 'target-user',
        tenantId: 'tenant-1',
        companyId: 'company-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.revokeForAdmin({
        id: companySession.id,
        actorUserId: 'admin-user',
        targetUserId: 'target-user',
        tenantId: 'tenant-1',
        companyId: 'company-1',
      }),
    ).resolves.toEqual({ id: companySession.id, revoked: true });

    expect(await service.listForCompany('target-user', 'tenant-1', 'company-2')).toHaveLength(1);
  });
});
