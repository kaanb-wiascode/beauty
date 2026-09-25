import { z } from 'zod';

export const creatorPlatformSchema = z.enum(['INSTAGRAM','TIKTOK','YOUTUBE','FACEBOOK','LINKEDIN','OTHER']);
export const creatorStatusSchema = z.enum(['ACTIVE','PAUSED','ENDED','BLACKLISTED']);
export const collaborationStatusSchema = z.enum(['PLANNED','CONTRACTED','IN_PROGRESS','DELIVERED','COMPLETED','CANCELLED']);

export const createCreatorSchema = z.object({
  displayName: z.string().trim().min(2).max(220),
  legalName: z.string().trim().max(220).nullable().optional(),
  category: z.string().trim().max(160).nullable().optional(),
  status: creatorStatusSchema.default('ACTIVE'),
  branchId: z.string().uuid().nullable().optional(),
  primaryPlatform: creatorPlatformSchema,
  handle: z.string().trim().min(1).max(180),
  profileUrl: z.string().trim().url().max(1200).nullable().optional(),
  followerCount: z.coerce.number().int().min(0).default(0),
  engagementRate: z.coerce.number().min(0).nullable().optional(),
  audienceProfile: z.record(z.string(), z.unknown()).default({}),
  rateCard: z.record(z.string(), z.unknown()).default({}),
  contactEmail: z.string().trim().email().max(254).nullable().optional(),
  contactPhone: z.string().trim().max(60).nullable().optional(),
  notes: z.string().trim().max(8000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const listCreatorsSchema = z.object({
  status: creatorStatusSchema.optional(),
  platform: creatorPlatformSchema.optional(),
  search: z.string().trim().max(180).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const createCreatorCollaborationSchema = z.object({
  campaignId: z.string().uuid().nullable().optional(),
  status: collaborationStatusSchema.default('PLANNED'),
  feeAmount: z.coerce.number().min(0).default(0),
  currency: z.string().trim().length(3).transform((v)=>v.toUpperCase()).default('TRY'),
  couponCode: z.string().trim().max(120).nullable().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  deliverables: z.array(z.object({
    platform: creatorPlatformSchema,
    format: z.string().trim().min(1).max(80),
    quantity: z.coerce.number().int().min(1).max(100).default(1),
    dueAt: z.coerce.date().nullable().optional(),
  })).default([]),
  performance: z.record(z.string(), z.unknown()).default({}),
  notes: z.string().trim().max(8000).nullable().optional(),
}).refine((v)=>!v.startsAt||!v.endsAt||v.endsAt>=v.startsAt,{message:'Collaboration end date must be after the start date.'});

export type CreateCreatorInput=z.infer<typeof createCreatorSchema>;
export type CreateCreatorCollaborationInput=z.infer<typeof createCreatorCollaborationSchema>;
