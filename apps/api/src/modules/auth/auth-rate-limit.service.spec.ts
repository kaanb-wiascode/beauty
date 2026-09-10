import { HttpStatus } from '@nestjs/common';

import { RedisService } from '../../infrastructure/redis/redis.service';
import { AuthRateLimitService } from './auth-rate-limit.service';

describe('AuthRateLimitService', () => {
  const increment = jest.fn(async (_key: string, _ttl: number) => 1);
  const redis = { increment } as unknown as RedisService;
  let service: AuthRateLimitService;

  beforeEach(() => {
    increment.mockClear();
    service = new AuthRateLimitService(redis);
  });

  it('allows requests within the configured limit', async () => {
    increment.mockResolvedValue(10);

    await expect(
      service.assertAllowed('login', '203.0.113.10', 10, 60),
    ).resolves.toBeUndefined();

    expect(increment).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:ratelimit:login:[a-f0-9]{64}$/),
      60,
    );
  });

  it('rejects requests above the configured limit with HTTP 429', async () => {
    increment.mockResolvedValue(11);

    await expect(
      service.assertAllowed('login', '203.0.113.10', 10, 60),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
  });

  it('does not store the raw identifier in the Redis key', async () => {
    increment.mockResolvedValue(1);

    await service.assertAllowed('login', 'sensitive-ip', 10, 60);

    const key = increment.mock.calls[0]?.[0];
    expect(key).toBeDefined();
    expect(key).not.toContain('sensitive-ip');
    expect(key).toMatch(/^auth:ratelimit:login:[a-f0-9]{64}$/);
  });
});
