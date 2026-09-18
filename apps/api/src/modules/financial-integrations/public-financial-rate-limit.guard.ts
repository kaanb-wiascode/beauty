import { ExecutionContext, HttpException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../../infrastructure/redis/redis.service';

export const PUBLIC_FINANCIAL_RATE_LIMIT_KEY = 'publicFinancialRateLimit';
export type PublicFinancialRateLimitPolicy = { bucket: string; limit: number; windowSeconds: number };
export const PublicFinancialRateLimit = (policy: PublicFinancialRateLimitPolicy) =>
  SetMetadata(PUBLIC_FINANCIAL_RATE_LIMIT_KEY, policy);

@Injectable()
export class PublicFinancialRateLimitGuard {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<PublicFinancialRateLimitPolicy>(
      PUBLIC_FINANCIAL_RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!policy) return true;

    const request = context.switchToHttp().getRequest<{
      ip?: string;
      params?: Record<string, string>;
      headers?: Record<string, string | string[] | undefined>;
    }>();
    const forwarded = request.headers?.['x-forwarded-for'];
    const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const clientIp = forwardedValue?.split(',')[0]?.trim() || request.ip || 'unknown';
    const integrationId = request.params?.integrationId ?? 'none';
    const provider = (request.params?.provider ?? 'none').toUpperCase();
    const key = `rate:finance:public:${policy.bucket}:${integrationId}:${provider}:${clientIp}`;

    try {
      const client = this.redis.getClient();
      const count = await client.incr(key);
      if (count === 1) await client.expire(key, policy.windowSeconds);
      if (count > policy.limit) {
        throw new HttpException('Too many requests.', 429);
      }
      return true;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // Redis availability must not block signed provider callbacks/webhooks.
      return true;
    }
  }
}
