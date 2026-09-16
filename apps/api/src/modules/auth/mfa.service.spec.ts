import { ConfigService } from '@nestjs/config';

import { PrismaService } from '@beauty-erp/database';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { MfaService } from './mfa.service';

describe('MfaService', () => {
  const queryRaw = jest.fn();
  const executeRaw = jest.fn();
  const redisSet = jest.fn();
  const redisGet = jest.fn();
  const redisGetAndDelete = jest.fn();
  const auditRecord = jest.fn();

  const prisma = {
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
  } as unknown as PrismaService;
  const redis = {
    set: redisSet,
    get: redisGet,
    getAndDelete: redisGetAndDelete,
  } as unknown as RedisService;
  const config = {
    get: jest.fn((key: string) => key === 'MFA_ENCRYPTION_KEY' ? 'test-mfa-encryption-key' : undefined),
    getOrThrow: jest.fn(() => 'fallback-jwt-secret'),
  } as unknown as ConfigService;
  const audit = { record: auditRecord } as unknown as PlatformAuditService;
  const service = new MfaService(prisma, redis, config, audit);

  beforeEach(() => {
    jest.clearAllMocks();
    queryRaw.mockResolvedValue([]);
    executeRaw.mockResolvedValue(1);
    redisSet.mockResolvedValue(undefined);
    auditRecord.mockResolvedValue({ id: 'audit-1' });
  });

  it('returns an MFA challenge without exposing access or refresh credentials', async () => {
    const result = await service.beginLoginChallenge({
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
      user: { id: 'user-1', email: 'user@example.com', firstName: 'Test', lastName: 'User' },
      tenant: { id: 'tenant-1', name: 'Tenant', slug: 'tenant' },
      company: { id: 'company-1', name: 'Company', slug: 'company' },
      branch: null,
      membership: {
        id: 'membership-1',
        role: 'owner',
        roleScope: 'CENTRAL',
        status: 'ACTIVE',
        permissions: ['roles.read'],
        branchIds: [],
      },
    });

    expect(result.mfaRequired).toBe(true);
    expect(result.enrollmentRequired).toBe(true);
    expect(result).not.toHaveProperty('accessToken');
    expect(result).not.toHaveProperty('refreshToken');
    expect(redisSet).toHaveBeenCalledTimes(1);
    const storedChallenge = String(redisSet.mock.calls[0][1]);
    expect(storedChallenge).toContain('access-secret');
    expect(storedChallenge).toContain('refresh-secret');
  });

  it('stores an encrypted TOTP secret rather than the plaintext setup secret', async () => {
    const result = await service.setup('user-1', 'user@example.com');

    expect(result.secret).toMatch(/^[A-Z2-7]+$/);
    expect(result.otpauthUri).toContain(`secret=${result.secret}`);
    expect(executeRaw).toHaveBeenCalledTimes(1);
    const serializedWrite = JSON.stringify(executeRaw.mock.calls[0]);
    expect(serializedWrite).not.toContain(result.secret);
  });
});
