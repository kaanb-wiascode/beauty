import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { RedisService } from '../../infrastructure/redis/redis.service';

export const FINANCIAL_RATE_LIMIT_KEY = 'financialIntegrationRateLimit';
export type FinancialRateLimit = { limit: number; windowSeconds: number; bucket: string };
export const FinancialIntegrationRateLimit = (bucket: string, limit: number, windowSeconds: number) =>
  SetMetadata(FINANCIAL_RATE_LIMIT_KEY, { bucket, limit, windowSeconds } satisfies FinancialRateLimit);

@Injectable()
export class FinancialIntegrationRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<FinancialRateLimit>(FINANCIAL_RATE_LIMIT_KEY, [context.getHandler(), context.getClass()]);
    if (!policy) return true;

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;
    if (!user?.sub || !user.tenantId) return true;

    const key = `rate:finance:${user.tenantId}:${user.sub}:${policy.bucket}`;
    try {
      const client = this.redis.getClient();
      const count = await client.incr(key);
      if (count === 1) await client.expire(key, policy.windowSeconds);
      if (count > policy.limit) {
        throw new HttpException(
          `Rate limit exceeded for ${policy.bucket}.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // Redis availability must not turn a financial operation into an outage.
      return true;
    }
    return true;
  }
}
