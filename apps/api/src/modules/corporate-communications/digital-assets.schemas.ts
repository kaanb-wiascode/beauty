import { z } from 'zod';

const assetTypeSchema = z.enum([
  'LOGO',
  'COLOR_PALETTE',
  'FONT',
  'GUIDELINE',
  'TEMPLATE',
  'PHOTO',
  'VIDEO',
  'OTHER',
]);

export const createDigitalAssetSchema = z
  .object({
    name: z.string().trim().min(2).max(180),
    assetType: assetTypeSchema,
    branchId: z.string().uuid().nullable().optional(),
    storageKey: z.string().trim().max(800).optional(),
    externalUrl: z.string().trim().url().max(1200).optional(),
    version: z.string().trim().max(80).optional(),
    usageRules: z.string().trim().max(5000).optional(),
    mimeType: z.string().trim().max(180).optional(),
    fileSizeBytes: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    widthPx: z.coerce.number().int().positive().max(100000).optional(),
    heightPx: z.coerce.number().int().positive().max(100000).optional(),
    durationSeconds: z.coerce.number().min(0).max(86400).optional(),
    checksumSha256: z.string().trim().regex(/^[0-9A-Fa-f]{64}$/).transform((value) => value.toLowerCase()).optional(),
    rightsOwner: z.string().trim().max(240).optional(),
    licenseExpiresAt: z.coerce.date().nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .refine((value) => value.storageKey || value.externalUrl, {
    message: 'Digital asset requires storageKey or externalUrl.',
  });

export const updateDigitalAssetSchema = createDigitalAssetSchema
  .omit({ storageKey: true, externalUrl: true })
  .partial()
  .extend({
    storageKey: z.string().trim().max(800).nullable().optional(),
    externalUrl: z.string().trim().url().max(1200).nullable().optional(),
  });

export const listDigitalAssetsSchema = z.object({
  assetType: assetTypeSchema.optional(),
  search: z.string().trim().max(180).optional(),
  licenseState: z.enum(['VALID', 'EXPIRING', 'EXPIRED', 'UNTRACKED']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type CreateDigitalAssetInput = z.infer<typeof createDigitalAssetSchema>;
export type UpdateDigitalAssetInput = z.infer<typeof updateDigitalAssetSchema>;
export type ListDigitalAssetsInput = z.infer<typeof listDigitalAssetsSchema>;
