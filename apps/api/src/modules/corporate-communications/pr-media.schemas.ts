import { z } from 'zod';

export const prActivityTypeSchema=z.enum(['PRESS_RELEASE','MEDIA_RELATION','INTERVIEW','EVENT','SPONSORSHIP','CRISIS_COMMUNICATION','AWARD','OTHER']);
export const prActivityStatusSchema=z.enum(['PLANNED','CONTACTED','CONFIRMED','IN_PROGRESS','COMPLETED','CANCELLED']);

export const createPrActivitySchema=z.object({
  activityType:prActivityTypeSchema,
  status:prActivityStatusSchema.default('PLANNED'),
  title:z.string().trim().min(2).max(240),
  branchId:z.string().uuid().nullable().optional(),
  campaignId:z.string().uuid().nullable().optional(),
  outletName:z.string().trim().max(220).nullable().optional(),
  contactName:z.string().trim().max(180).nullable().optional(),
  contactEmail:z.string().trim().email().max(254).nullable().optional(),
  contactPhone:z.string().trim().max(60).nullable().optional(),
  startsAt:z.coerce.date().nullable().optional(),
  endsAt:z.coerce.date().nullable().optional(),
  location:z.string().trim().max(500).nullable().optional(),
  objective:z.string().trim().max(3000).nullable().optional(),
  keyMessage:z.string().trim().max(5000).nullable().optional(),
  costAmount:z.coerce.number().min(0).default(0),
  currency:z.string().trim().length(3).transform((v)=>v.toUpperCase()).default('TRY'),
  estimatedReach:z.coerce.number().int().min(0).default(0),
  actualReach:z.coerce.number().int().min(0).default(0),
  estimatedMediaValue:z.coerce.number().min(0).default(0),
  ownerUserId:z.string().uuid().nullable().optional(),
  notes:z.string().trim().max(8000).nullable().optional(),
  metadata:z.record(z.string(),z.unknown()).default({}),
}).refine((v)=>!v.startsAt||!v.endsAt||v.endsAt>=v.startsAt,{message:'PR activity end date must be after the start date.'});

export const updatePrActivitySchema=z.object({
  status:prActivityStatusSchema.optional(),
  outletName:z.string().trim().max(220).nullable().optional(),
  contactName:z.string().trim().max(180).nullable().optional(),
  actualReach:z.coerce.number().int().min(0).optional(),
  estimatedMediaValue:z.coerce.number().min(0).optional(),
  notes:z.string().trim().max(8000).nullable().optional(),
  metadata:z.record(z.string(),z.unknown()).optional(),
});

export const listPrActivitiesSchema=z.object({
  status:prActivityStatusSchema.optional(),
  activityType:prActivityTypeSchema.optional(),
  search:z.string().trim().max(180).optional(),
  limit:z.coerce.number().int().min(1).max(200).default(100),
});

export type CreatePrActivityInput=z.infer<typeof createPrActivitySchema>;
export type UpdatePrActivityInput=z.infer<typeof updatePrActivitySchema>;
