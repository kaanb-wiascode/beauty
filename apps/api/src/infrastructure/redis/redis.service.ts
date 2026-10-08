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
    return this.client.get(key);
  }

  async getAndDelete(key: string): Promise<string | null> {
    return this.client.getDel(key);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async publish(channel: string, payload: string): Promise<void> {
    await this.client.publish(channel, payload);
  }

  async subscribe(
    channel: string,
    listener: (payload: string) => void,
  ): Promise<() => Promise<void>> {
    const subscriber = this.client.duplicate();
    subscriber.on('error', (error) => {
      console.error('[Redis] Subscriber error:', error);
    });
    await subscriber.connect();
    await subscriber.subscribe(channel, listener);

    return async () => {
      if (subscriber.isOpen) {
        await subscriber.unsubscribe(channel);
        await subscriber.quit();
      }
    };
  }

  getClient(): RedisClientType {
    return this.client;
  }
}
