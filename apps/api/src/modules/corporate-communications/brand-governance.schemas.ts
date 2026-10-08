import { z } from 'zod';

const stringList = z.array(z.string().trim().min(1).max(240)).max(100).default([]);

const colorTokenSchema = z.object({
  name: z.string().trim().min(1).max(100),
  hex: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/),
  usage: z.string().trim().max(500).optional(),
});

const fontTokenSchema = z.object({
  name: z.string().trim().min(1).max(120),
  family: z.string().trim().min(1).max(180),
  role: z.enum(['DISPLAY', 'HEADING', 'BODY', 'CAPTION', 'OTHER']),
  weight: z.string().trim().max(80).optional(),
  usage: z.string().trim().max(500).optional(),
});

export const upsertBrandGovernanceSchema = z.object({
  branchId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(2).max(180),
  toneOfVoice: z.string().trim().max(5000).nullable().optional(),
  brandPersonality: stringList,
  allowedPhrases: stringList,
  forbiddenPhrases: stringList,
  hashtagRules: z.object({
    required: stringList,
    preferred: stringList,
    forbidden: stringList,
    maxCount: z.coerce.number().int().min(0).max(100).nullable().optional(),
    notes: z.string().trim().max(3000).nullable().optional(),
  }).default({ required: [], preferred: [], forbidden: [] }),
  colorTokens: z.array(colorTokenSchema).max(100).default([]),
  fontTokens: z.array(fontTokenSchema).max(100).default([]),
  logoRules: z.object({
    safeArea: z.string().trim().max(1000).nullable().optional(),
    minimumSize: z.string().trim().max(500).nullable().optional(),
    allowedBackgrounds: stringList,
    forbiddenUses: stringList,
    notes: z.string().trim().max(3000).nullable().optional(),
  }).default({ allowedBackgrounds: [], forbiddenUses: [] }),
  contentRules: z.object({
    requiredDisclosures: stringList,
    forbiddenClaims: stringList,
    ctaGuidelines: z.string().trim().max(3000).nullable().optional(),
    visualGuidelines: z.string().trim().max(5000).nullable().optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
  }).default({ requiredDisclosures: [], forbiddenClaims: [] }),
});

export type UpsertBrandGovernanceInput = z.infer<typeof upsertBrandGovernanceSchema>;
