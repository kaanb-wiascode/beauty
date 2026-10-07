import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';

import { RedisService } from '../../infrastructure/redis/redis.service';

const MARKETING_PUBLIC_RATE_LIMIT_KEY = 'marketingPublicRateLimit';

type Policy = {
  bucket: string;
  limit: number;
  windowSeconds: number;
};

export const MarketingPublicRateLimit = (
  bucket: string,
  limit: number,
  windowSeconds: number,
) =>
  SetMetadata(MARKETING_PUBLIC_RATE_LIMIT_KEY, {
    bucket,
    limit,
    windowSeconds,
  } satisfies Policy);

@Injectable()
export class MarketingPublicRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<Policy>(
      MARKETING_PUBLIC_RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!policy) return true;

    const request = context.switchToHttp().getRequest<{
      ip?: string;
      socket?: { remoteAddress?: string | null };
    }>();
    const remoteAddress =
      request.ip || request.socket?.remoteAddress || 'unknown';
    const clientHash = createHash('sha256')
      .update(remoteAddress)
      .digest('hex')
      .slice(0, 24);
    const key = `rate:marketing-public:${clientHash}:${policy.bucket}`;

    try {
      const client = this.redis.getClient();
      const count = await client.incr(key);
      if (count === 1) await client.expire(key, policy.windowSeconds);
      if (count > policy.limit) {
        throw new HttpException(
          'Çok fazla demo talebi gönderildi. Lütfen daha sonra tekrar deneyin.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (process.env.NODE_ENV === 'production') {
        throw new ServiceUnavailableException(
          'Demo talebi koruması şu anda kullanılamıyor.',
        );
      }
      return true;
    }

    return true;
  }
}
