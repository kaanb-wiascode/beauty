import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGINS: z.string().trim().min(1).optional(),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  RELEASE_SHA: z.string().regex(/^[0-9a-f]{40}$/).optional(),

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

  PLATFORM_INVITATION_WEBHOOK_URL: z.string().url().optional(),
  PLATFORM_INVITATION_WEBHOOK_SECRET: z.string().min(32).optional(),
  PLATFORM_INVITATION_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(5000),
  PLATFORM_INVITATION_TOKEN_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(72),

  OBJECT_STORAGE_BUCKET: z.string().trim().min(1).optional(),
  OBJECT_STORAGE_REGION: z.string().trim().min(1).optional(),
  OBJECT_STORAGE_ENDPOINT: z.string().url().optional(),
  OBJECT_STORAGE_FORCE_PATH_STYLE: z.enum(['true', 'false']).optional(),
  OBJECT_STORAGE_ACCESS_KEY_ID: z.string().trim().min(1).optional(),
  OBJECT_STORAGE_SECRET_ACCESS_KEY: z.string().trim().min(1).optional(),
  OBJECT_STORAGE_PRESIGN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).optional(),
  OBJECT_STORAGE_MAX_BYTES: z.coerce.number().int().min(1_048_576).max(104_857_600).optional(),

  REPORT_EXPORT_STORAGE_DRIVER: z.enum(['filesystem', 'object']).default('filesystem'),
  REPORT_EXPORT_STORAGE_DIR: z.string().trim().min(1).default('.report-exports'),
  REPORT_EXPORT_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(7),
  REPORT_EXPORT_WORKER_ENABLED: z.enum(['true', 'false']).default('false'),
  REPORT_EXPORT_WORKER_POLL_MS: z.coerce.number().int().min(1000).max(60000).default(5000),
  REPORT_EXPORT_WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(20).default(5),
  REPORT_EXPORT_EXPIRY_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(100),
  REPORT_EXPORT_STALE_PROCESSING_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
  REPORT_EXPORT_STALE_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(100),
  REPORT_EXPORT_ACTIVE_JOB_LIMIT: z.coerce.number().int().min(1).max(20).default(3),
  REPORT_EXPORT_ROW_LIMIT: z.coerce.number().int().min(100).max(100000).default(50000),
  REPORT_SCHEDULE_BATCH_SIZE: z.coerce.number().int().min(1).max(20).default(5),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV === 'production' && !env.RELEASE_SHA) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'RELEASE_SHA must be configured in production',
      path: ['RELEASE_SHA'],
    });
  }

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
    } else if (
      env.NODE_ENV === 'production' &&
      origins.some((origin) => new URL(origin).protocol !== 'https:')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CORS_ORIGINS must use HTTPS in production',
        path: ['CORS_ORIGINS'],
      });
    }
  }

  if (
    env.NODE_ENV === 'production' &&
    env.PUBLIC_API_URL &&
    new URL(env.PUBLIC_API_URL).protocol !== 'https:'
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'PUBLIC_API_URL must use HTTPS in production',
      path: ['PUBLIC_API_URL'],
    });
  }

  if (
    env.NODE_ENV === 'production' &&
    env.OBJECT_STORAGE_ENDPOINT &&
    new URL(env.OBJECT_STORAGE_ENDPOINT).protocol !== 'https:'
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'OBJECT_STORAGE_ENDPOINT must use HTTPS in production',
      path: ['OBJECT_STORAGE_ENDPOINT'],
    });
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

  const hasPlatformInvitationUrl = Boolean(env.PLATFORM_INVITATION_WEBHOOK_URL);
  const hasPlatformInvitationSecret = Boolean(env.PLATFORM_INVITATION_WEBHOOK_SECRET);
  if (hasPlatformInvitationUrl !== hasPlatformInvitationSecret) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'PLATFORM_INVITATION_WEBHOOK_URL and PLATFORM_INVITATION_WEBHOOK_SECRET must be configured together',
      path: ['PLATFORM_INVITATION_WEBHOOK_URL'],
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

  if (env.NODE_ENV === 'production') {
    if (configuredStorageFields !== storageFields.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Private object storage must be fully configured in production',
        path: ['OBJECT_STORAGE_BUCKET'],
      });
    }

    if (env.REPORT_EXPORT_STORAGE_DRIVER !== 'object') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'REPORT_EXPORT_STORAGE_DRIVER must be object in production',
        path: ['REPORT_EXPORT_STORAGE_DRIVER'],
      });
    }

    if (env.REPORT_EXPORT_WORKER_ENABLED !== 'true') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'REPORT_EXPORT_WORKER_ENABLED must be true in production',
        path: ['REPORT_EXPORT_WORKER_ENABLED'],
      });
    }
  }
});

export type Env = z.infer<typeof envSchema>;
