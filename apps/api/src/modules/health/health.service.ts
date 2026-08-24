import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@beauty-erp/database';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class HealthService {
  private readonly redis: RedisClientType;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.redis = createClient({
      url: this.configService.get<string>(
        'REDIS_URL',
        'redis://localhost:6379',
      ),
    });
  }

  async check() {
    const database = await this.checkDatabase();
    const redis = await this.checkRedis();

    const isHealthy = database === 'up' && redis === 'up';

    return {
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database,
        redis,
      },
    };
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
      if (!this.redis.isOpen) {
        await this.redis.connect();
      }

      await this.redis.ping();

      return 'up';
    } catch {
      return 'down';
    }
  }
}