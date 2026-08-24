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
  
    getClient(): RedisClientType {
      return this.client;
    }
  }