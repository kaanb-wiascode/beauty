import { envSchema } from './env.schema';

const productionEnv = {
  NODE_ENV: 'production',
  PORT: '3000',
  CORS_ORIGINS: 'https://app.valoo.example',
  PUBLIC_API_URL: 'https://api.valoo.example',
  DATABASE_URL: 'postgresql://user:password@db.example:5432/valoo',
  REDIS_URL: 'redis://redis.example:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  OBJECT_STORAGE_BUCKET: 'valoo-private',
  OBJECT_STORAGE_REGION: 'eu-central-1',
  OBJECT_STORAGE_ACCESS_KEY_ID: 'access-key',
  OBJECT_STORAGE_SECRET_ACCESS_KEY: 'secret-key',
  REPORT_EXPORT_STORAGE_DRIVER: 'object',
  REPORT_EXPORT_WORKER_ENABLED: 'true',
};

describe('envSchema production hardening', () => {
  it('accepts a production-safe runtime configuration', () => {
    expect(envSchema.safeParse(productionEnv).success).toBe(true);
  });

  it('rejects non-HTTPS CORS origins in production', () => {
    const result = envSchema.safeParse({
      ...productionEnv,
      CORS_ORIGINS: 'http://app.valoo.example',
    });

    expect(result.success).toBe(false);
  });

  it('rejects filesystem report storage in production', () => {
    const result = envSchema.safeParse({
      ...productionEnv,
      REPORT_EXPORT_STORAGE_DRIVER: 'filesystem',
    });

    expect(result.success).toBe(false);
  });

  it('rejects incomplete private object storage in production', () => {
    const { OBJECT_STORAGE_SECRET_ACCESS_KEY: _secret, ...withoutSecret } =
      productionEnv;

    expect(envSchema.safeParse(withoutSecret).success).toBe(false);
  });

  it('keeps local development defaults usable', () => {
    const result = envSchema.safeParse({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/beauty',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      JWT_REFRESH_SECRET: 'b'.repeat(32),
      CORS_ORIGINS: 'http://localhost:3001',
    });

    expect(result.success).toBe(true);
  });
});
