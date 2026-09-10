import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly client: RedisClientType;

  constructor(private readonly configService: ConfigService) {
    this.client = createClient({
      url: this.configService.get<string>(
        'REDIS_URL',
        'redis://localhost:6379',
      ),
    });

    this.client.on('error', (error) => {
      console.error('[Redis] Client error:', error);
    });
  }

  async onModuleInit(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  async set(
    key: string,
    value: string,
    expiresInSeconds: number,
  ): Promise<void> {
    await this.client.set(key, value, {
      EX: expiresInSeconds,
    });
  }

  async get(key: string): Promise<string | null> {
    // Refresh sessions are single-use; consume them atomically to prevent
    // concurrent refresh requests from both accepting the same token.
    if (key.startsWith('auth:refresh:')) {
      return this.client.getDel(key);
    }

    return this.client.get(key);
  }

  async getDel(key: string): Promise<string | null> {
    return this.client.getDel(key);
  }

  async increment(key: string, expiresInSeconds: number): Promise<number> {
    const count = await this.client.incr(key);

    if (count === 1) {
      await this.client.expire(key, expiresInSeconds);
    }

    return count;
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  getClient(): RedisClientType {
    return this.client;
  }
}
