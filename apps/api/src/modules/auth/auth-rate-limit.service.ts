import { Injectable, TooManyRequestsException } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { RedisService } from '../../infrastructure/redis/redis.service';

@Injectable()
export class AuthRateLimitService {
  constructor(private readonly redis: RedisService) {}

  async assertAllowed(
    action: 'login' | 'register' | 'refresh',
    identifier: string,
    maxAttempts: number,
    windowSeconds: number,
  ): Promise<void> {
    const normalized = identifier.trim() || 'unknown';
    const digest = createHash('sha256').update(normalized).digest('hex');
    const key = `auth:ratelimit:${action}:${digest}`;
    const count = await this.redis.increment(key, windowSeconds);

    if (count > maxAttempts) {
      throw new TooManyRequestsException(
        'Too many authentication attempts. Please try again later.',
      );
    }
  }
}
