import { BadRequestException } from '@nestjs/common';
import { FinancialIntegrationConnectionService } from './financial-integration-connection.service';

describe('FinancialIntegrationConnectionService callback claims', () => {
  it('performs provider code exchange outside the database transaction', async () => {
    let insideTransaction = false;
    const tx = {
      $queryRawUnsafe: jest.fn()
        .mockResolvedValueOnce([{
          id: 'session-a',
          integrationId: 'integration-a',
          callbackUrl: 'https://api.example.com/financial-integrations/callback',
        }])
        .mockResolvedValueOnce([{ kind: 'OPEN_BANKING', provider: 'BANK' }])
        .mockResolvedValueOnce([{ id: 'session-a', integrationId: 'integration-a' }])
        .mockResolvedValueOnce([{
          id: 'integration-a', kind: 'OPEN_BANKING', provider: 'BANK', displayName: 'Bank',
          status: 'CONNECTED', branchId: null, consentExpiresAt: null,
        }]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => {
        insideTransaction = true;
        try { return await callback(tx); } finally { insideTransaction = false; }
      }),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    } as never;
    const exchangeAuthorizationCode = jest.fn().mockImplementation(async () => {
      expect(insideTransaction).toBe(false);
      return { accessToken: 'token' };
    });
    const providers = {
      get: jest.fn().mockReturnValue({ exchangeAuthorizationCode }),
      has: jest.fn().mockReturnValue(true),
    } as never;
    const vault = { storeWith: jest.fn().mockResolvedValue(undefined) } as never;
    const config = { get: jest.fn() } as never;
    const integrations = {} as never;
    const service = new FinancialIntegrationConnectionService(prisma, integrations, providers, vault, config);

    const result = await service.callback('state-value', 'code-value');

    expect(exchangeAuthorizationCode).toHaveBeenCalledTimes(1);
    expect((vault as any).storeWith).toHaveBeenCalled();
    expect(result).toMatchObject({ id: 'integration-a', status: 'CONNECTED' });
  });

  it('does not call the provider when the callback state is already claimed', async () => {
    const tx = { $queryRawUnsafe: jest.fn().mockResolvedValue([]) };
    const prisma = {
      $transaction: jest.fn().mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as never;
    const exchangeAuthorizationCode = jest.fn();
    const providers = { get: jest.fn().mockReturnValue({ exchangeAuthorizationCode }) } as never;
    const service = new FinancialIntegrationConnectionService(
      prisma,
      {} as never,
      providers,
      {} as never,
      { get: jest.fn() } as never,
    );

    await expect(service.callback('state-value', 'code-value')).rejects.toBeInstanceOf(BadRequestException);
    expect(exchangeAuthorizationCode).not.toHaveBeenCalled();
  });
});
