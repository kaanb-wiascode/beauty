import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { RedisService } from '../../infrastructure/redis/redis.service';

interface ResilienceOptions {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  failureThreshold?: number;
  openSeconds?: number;
}

@Injectable()
export class ProviderResilienceService {
  constructor(private readonly redis: RedisService) {}

  async execute<T>(key: string, operation: () => Promise<T>, options: ResilienceOptions = {}): Promise<T> {
    const timeoutMs = options.timeoutMs ?? 10_000;
    const retries = options.retries ?? 0;
    const retryDelayMs = options.retryDelayMs ?? 250;
    const failureThreshold = options.failureThreshold ?? 5;
    const openSeconds = options.openSeconds ?? 60;
    const circuitKey = `finance:provider:circuit:${key}`;
    const failureKey = `finance:provider:failures:${key}`;

    try {
      if (await this.redis.get(circuitKey)) {
        throw new ServiceUnavailableException('Financial provider circuit is temporarily open.');
      }
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      // Redis observability failure must not block provider traffic.
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const result = await this.withTimeout(operation(), timeoutMs);
        try { await this.redis.delete(failureKey); } catch {}
        return result;
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (attempt + 1)));
        }
      }
    }

    try {
      const client = this.redis.getClient();
      const failures = await client.incr(failureKey);
      if (failures === 1) await client.expire(failureKey, openSeconds * 2);
      if (failures >= failureThreshold) {
        await this.redis.set(circuitKey, '1', openSeconds);
        await this.redis.delete(failureKey);
      }
    } catch {}

    throw lastError;
  }

  async status(key: string) {
    try {
      return { open: Boolean(await this.redis.get(`finance:provider:circuit:${key}`)) };
    } catch {
      return { open: false };
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new ServiceUnavailableException('Financial provider request timed out.')), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
