import { ServiceUnavailableException } from '@nestjs/common';
import { ProviderResilienceService } from './provider-resilience.service';

describe('ProviderResilienceService', () => {
  function service(initialCircuit: string | null = null) {
    const client = {
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(true),
    };
    const redis = {
      get: jest.fn().mockResolvedValue(initialCircuit),
      delete: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      getClient: jest.fn().mockReturnValue(client),
    } as never;
    return { service: new ProviderResilienceService(redis), redis: redis as any, client };
  }

  it('retries explicitly safe provider operations', async () => {
    const { service } = service();
    const operation = jest.fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce('ok');

    await expect(service.execute('bank:read', operation, { retries: 1, retryDelayMs: 1 })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('opens the circuit after the configured failure threshold', async () => {
    const { service, redis } = service();
    await expect(service.execute(
      'bank:read',
      async () => { throw new Error('down'); },
      { failureThreshold: 1, openSeconds: 30 },
    )).rejects.toThrow('down');

    expect(redis.set).toHaveBeenCalledWith('finance:provider:circuit:bank:read', '1', 30);
  });

  it('short-circuits provider calls while the circuit is open', async () => {
    const { service } = service('1');
    const operation = jest.fn();

    await expect(service.execute('bank:read', operation)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(operation).not.toHaveBeenCalled();
  });
});
