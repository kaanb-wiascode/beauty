import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { RedisService } from '../../infrastructure/redis/redis.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  live() {
    return {
      status: 'ok' as const,
      timestamp: new Date().toISOString(),
    };
  }

  async ready() {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const isHealthy = database === 'up' && redis === 'up';

    return {
      status: isHealthy ? ('ok' as const) : ('degraded' as const),
      timestamp: new Date().toISOString(),
      services: {
        database,
        redis,
      },
    };
  }

  async check() {
    return this.ready();
  }

  private async checkDatabase(): Promise<'up' | 'down'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async checkRedis(): Promise<'up' | 'down'> {
    try {
      await this.redis.ping();
      return 'up';
    } catch {
      return 'down';
    }
  }
}
