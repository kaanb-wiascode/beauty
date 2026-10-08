import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';

import { RedisService } from '../../infrastructure/redis/redis.service';

const MARKETPLACE_PUBLIC_RATE_LIMIT_KEY =
  'marketplacePublicRateLimit';

type MarketplacePublicRateLimitPolicy = {
  bucket: string;
  limit: number;
  windowSeconds: number;
};

export const MarketplacePublicRateLimit = (
  bucket: string,
  limit: number,
  windowSeconds: number,
) =>
  SetMetadata(MARKETPLACE_PUBLIC_RATE_LIMIT_KEY, {
    bucket,
    limit,
    windowSeconds,
  } satisfies MarketplacePublicRateLimitPolicy);

@Injectable()
export class MarketplacePublicRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy =
      this.reflector.getAllAndOverride<MarketplacePublicRateLimitPolicy>(
        MARKETPLACE_PUBLIC_RATE_LIMIT_KEY,
        [context.getHandler(), context.getClass()],
      );

    if (!policy) return true;

    const request = context.switchToHttp().getRequest<{
      ip?: string;
      socket?: { remoteAddress?: string | null };
      params?: { companySlug?: string; branchCode?: string };
    }>();

    const remoteAddress =
      request.ip || request.socket?.remoteAddress || 'unknown';
    const clientHash = createHash('sha256')
      .update(remoteAddress)
      .digest('hex')
      .slice(0, 24);
    const companySlug = request.params?.companySlug || 'unknown-company';
    const branchCode = request.params?.branchCode || 'unknown-branch';
    const key = [
      'rate',
      'marketplace-public',
      companySlug,
      branchCode,
      clientHash,
      policy.bucket,
    ].join(':');

    try {
      const client = this.redis.getClient();
      const count = await client.incr(key);

      if (count === 1) {
        await client.expire(key, policy.windowSeconds);
      }

      if (count > policy.limit) {
        throw new HttpException(
          'Too many requests. Please try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;

      // Public marketplace availability should not depend on Redis health.
      return true;
    }

    return true;
  }
}
