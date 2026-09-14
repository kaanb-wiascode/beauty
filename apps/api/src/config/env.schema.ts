import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGINS: z.string().trim().min(1).optional(),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),

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

  CRM_COMMUNICATION_MASTER_KEY: z.string().min(32).optional(),
  CRM_COMMUNICATION_MASTER_KEY_VERSION: z.string().trim().min(1).max(64).default('v1'),
  CRM_COMMUNICATION_PREVIOUS_MASTER_KEYS: z.string().optional(),

  QUALITY_NOTIFICATION_WEBHOOK_URL: z.string().url().optional(),
  QUALITY_NOTIFICATION_WEBHOOK_SECRET: z.string().min(32).optional(),
  QUALITY_NOTIFICATION_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(5000),
  QUALITY_FEEDBACK_PUBLIC_TOKEN_SECRET: z.string().min(32).optional(),

  OBJECT_STORAGE_BUCKET: z.string().trim().min(1).optional(),
  OBJECT_STORAGE_REGION: z.string().trim().min(1).optional(),
  OBJECT_STORAGE_ENDPOINT: z.string().url().optional(),
  OBJECT_STORAGE_FORCE_PATH_STYLE: z.enum(['true', 'false']).optional(),
  OBJECT_STORAGE_ACCESS_KEY_ID: z.string().trim().min(1).optional(),
  OBJECT_STORAGE_SECRET_ACCESS_KEY: z.string().trim().min(1).optional(),
  OBJECT_STORAGE_PRESIGN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).optional(),
  OBJECT_STORAGE_MAX_BYTES: z.coerce.number().int().min(1_048_576).max(104_857_600).optional(),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV === 'production' && !env.CORS_ORIGINS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'CORS_ORIGINS must be configured in production',
      path: ['CORS_ORIGINS'],
    });
  }

  if (env.CORS_ORIGINS) {
    const origins = env.CORS_ORIGINS.split(',').map((value) => value.trim());
    if (origins.some((origin) => !origin || !URL.canParse(origin))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CORS_ORIGINS must contain comma-separated absolute URLs',
        path: ['CORS_ORIGINS'],
      });
    }
  }

  const hasUrl = Boolean(env.QUALITY_NOTIFICATION_WEBHOOK_URL);
  const hasSecret = Boolean(env.QUALITY_NOTIFICATION_WEBHOOK_SECRET);
  if (hasUrl !== hasSecret) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'QUALITY_NOTIFICATION_WEBHOOK_URL and QUALITY_NOTIFICATION_WEBHOOK_SECRET must be configured together',
      path: ['QUALITY_NOTIFICATION_WEBHOOK_URL'],
    });
  }

  const storageFields = [
    env.OBJECT_STORAGE_BUCKET,
    env.OBJECT_STORAGE_ACCESS_KEY_ID,
    env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
  ];
  const configuredStorageFields = storageFields.filter(Boolean).length;
  if (configuredStorageFields > 0 && configuredStorageFields < storageFields.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'OBJECT_STORAGE_BUCKET, OBJECT_STORAGE_ACCESS_KEY_ID and OBJECT_STORAGE_SECRET_ACCESS_KEY must be configured together',
      path: ['OBJECT_STORAGE_BUCKET'],
    });
  }
});

export type Env = z.infer<typeof envSchema>;
