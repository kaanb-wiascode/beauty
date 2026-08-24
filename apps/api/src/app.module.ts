import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@beauty-erp/database';
import { envSchema } from './config/env.schema';
import { HealthModule } from './modules/health/health.module';
import { RedisModule } from './infrastructure/redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (config) => envSchema.parse(config),
    }),
    DatabaseModule,
    RedisModule,
    HealthModule,
  ],
})
export class AppModule {}