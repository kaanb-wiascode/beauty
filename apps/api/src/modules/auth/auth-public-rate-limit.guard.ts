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

const AUTH_PUBLIC_RATE_LIMIT_KEY = 'authPublicRateLimit';

type AuthPublicRateLimitPolicy = {
  bucket: string;
  limit: number;
  windowSeconds: number;
};

export const AuthPublicRateLimit = (
  bucket: string,
  limit: number,
  windowSeconds: number,
) =>
  SetMetadata(AUTH_PUBLIC_RATE_LIMIT_KEY, {
    bucket,
    limit,
    windowSeconds,
  } satisfies AuthPublicRateLimitPolicy);

@Injectable()
export class AuthPublicRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<AuthPublicRateLimitPolicy>(
      AUTH_PUBLIC_RATE_LIMIT_KEY,
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
    const key = `rate:auth:${clientHash}:${policy.bucket}`;

    try {
      const client = this.redis.getClient();
      const count = await client.incr(key);

      if (count === 1) {
        await client.expire(key, policy.windowSeconds);
      }

      if (count > policy.limit) {
        throw new HttpException(
          'Too many authentication requests. Please try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;

      // Redis availability must not block legitimate authentication.
      return true;
    }

    return true;
  }
}
