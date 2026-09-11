import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().url(),

  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  PUBLIC_API_URL: z.string().url().optional(),
  FINANCIAL_INTEGRATION_MASTER_KEY: z.string().min(32).optional(),
  FINANCIAL_INTEGRATION_MASTER_KEY_VERSION: z.string().trim().min(1).max(64).default('v1'),
  FINANCIAL_INTEGRATION_PREVIOUS_MASTER_KEYS: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;
