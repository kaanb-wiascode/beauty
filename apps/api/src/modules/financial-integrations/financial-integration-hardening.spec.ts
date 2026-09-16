import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationSecretVaultService } from './integration-secret-vault.service';
import { PublicFinancialRateLimitGuard } from './public-financial-rate-limit.guard';

function publicContext() {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue({
        ip: '127.0.0.1',
        params: { integrationId: 'integration-a', provider: 'PAYTR' },
        headers: {},
      }),
    }),
  } as never;
}

describe('Financial integration production hardening', () => {
  it('enforces public webhook distributed rate limit', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue({ bucket: 'pos-webhook', limit: 2, windowSeconds: 60 }),
    } as never;
    const client = { incr: jest.fn().mockResolvedValue(3), expire: jest.fn() };
    const redis = { getClient: jest.fn().mockReturnValue(client) } as never;
    const guard = new PublicFinancialRateLimitGuard(reflector, redis);

    await expect(guard.canActivate(publicContext())).rejects.toBeInstanceOf(HttpException);
  });

  it('rotates an old encrypted credential envelope onto the active key version', async () => {
    const rows: Array<any[]> = [];
    const prisma = {
      $executeRawUnsafe: jest.fn().mockImplementation(async (...args: any[]) => { rows.push(args); return 1; }),
      $queryRawUnsafe: jest.fn(),
    } as never;
    const values: Record<string, string> = {
      FINANCIAL_INTEGRATION_MASTER_KEY: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      FINANCIAL_INTEGRATION_MASTER_KEY_VERSION: 'v2',
      FINANCIAL_INTEGRATION_PREVIOUS_MASTER_KEYS: JSON.stringify({ v1: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }),
    };
    const config = { get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback) } as unknown as ConfigService;
    const vault = new IntegrationSecretVaultService(prisma, config);

    // First create a v1 envelope with a dedicated service instance.
    const oldConfig = {
      get: jest.fn((key: string, fallback?: string) => ({
        FINANCIAL_INTEGRATION_MASTER_KEY: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        FINANCIAL_INTEGRATION_MASTER_KEY_VERSION: 'v1',
      } as Record<string, string>)[key] ?? fallback),
    } as unknown as ConfigService;
    const oldPrisma = { $executeRawUnsafe: jest.fn() } as never;
    const oldVault = new IntegrationSecretVaultService(oldPrisma, oldConfig);
    await oldVault.storeOpaque('integration-a', { clientSecret: 'secret-value' });
    const encryptedPayload = (oldPrisma as unknown as { $executeRawUnsafe: jest.Mock }).$executeRawUnsafe.mock.calls[0][2];

    (prisma as unknown as { $queryRawUnsafe: jest.Mock }).$queryRawUnsafe.mockResolvedValue([
      { encryptedPayload, keyVersion: 'v1' },
    ]);

    const result = await vault.rotate('integration-a');
    expect(result).toEqual(expect.objectContaining({ rotated: true, previousKeyVersion: 'v1', keyVersion: 'v2' }));
    expect(rows[0][3]).toBe('v2');
  });
});
