import { z } from 'zod';

export const campaignStatusSchema = z.enum([
  'DRAFT',
  'PLANNED',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
]);

export const campaignObjectiveSchema = z.enum([
  'AWARENESS',
  'LEAD_GENERATION',
  'APPOINTMENT',
  'SALES',
  'RETENTION',
  'REACTIVATION',
]);

export const marketingProviderSchema = z.enum([
  'MANUAL',
  'META',
  'GOOGLE_ADS',
  'TIKTOK',
  'WEBSITE',
  'WHATSAPP',
  'OTHER',
]);

export const createCampaignSchema = z
  .object({
    name: z.string().trim().min(2).max(180),
    objective: campaignObjectiveSchema.default('LEAD_GENERATION'),
    status: campaignStatusSchema.default('DRAFT'),
    channel: z.string().trim().min(2).max(80).default('MULTI_CHANNEL'),
    branchId: z.string().uuid().nullable().optional(),
    serviceId: z.string().uuid().nullable().optional(),
    plannedBudget: z.coerce.number().min(0).default(0),
    spentAmount: z.coerce.number().min(0).default(0),
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((value) => value.toUpperCase())
      .default('TRY'),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    ownerUserId: z.string().uuid().nullable().optional(),
    notes: z.string().trim().max(3000).nullable().optional(),
  })
  .refine(
    (value) =>
      !value.startsAt || !value.endsAt || value.endsAt >= value.startsAt,
    { message: 'Campaign end date must be after the start date.' },
  );

export const listCampaignsSchema = z.object({
  status: campaignStatusSchema.optional(),
  search: z.string().trim().max(150).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const createMarketingLeadSchema = z
  .object({
    provider: marketingProviderSchema.default('MANUAL'),
    externalLeadId: z.string().trim().min(1).max(240).optional(),
    campaignId: z.string().uuid().optional(),
    branchId: z.string().uuid().optional(),
    preferredBranchId: z.string().uuid().optional(),
    assignedUserId: z.string().uuid().optional(),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    phone: z.string().trim().min(3).max(40).optional(),
    email: z.string().trim().email().max(254).optional(),
    serviceInterest: z.string().trim().max(300).optional(),
    sourcePayload: z.record(z.string(), z.unknown()).optional(),
    attribution: z
      .object({
        externalCampaignId: z.string().trim().max(240).optional(),
        externalAdGroupId: z.string().trim().max(240).optional(),
        externalAdId: z.string().trim().max(240).optional(),
        utmSource: z.string().trim().max(240).optional(),
        utmMedium: z.string().trim().max(240).optional(),
        utmCampaign: z.string().trim().max(240).optional(),
        utmContent: z.string().trim().max(240).optional(),
        clickId: z.string().trim().max(500).optional(),
      })
      .optional(),
  })
  .refine((value) => value.phone || value.email, {
    message: 'Marketing lead requires phone or email.',
  });

export const createMarketingAppointmentSchema = z
  .object({
    staffId: z.string().uuid(),
    serviceId: z.string().uuid(),
    sessionId: z.string().uuid().optional(),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((value) => value.endAt > value.startAt, {
    message: 'Appointment end date must be after the start date.',
  });

export const listMarketingLeadsSchema = z.object({
  provider: marketingProviderSchema.optional(),
  status: z
    .enum(['NEW', 'ROUTED', 'IN_CRM', 'APPOINTMENT', 'WON', 'LOST'])
    .optional(),
  campaignId: z.string().uuid().optional(),
  search: z.string().trim().max(150).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const createBrandAssetSchema = z
  .object({
    name: z.string().trim().min(2).max(180),
    assetType: z.enum([
      'LOGO',
      'COLOR_PALETTE',
      'FONT',
      'GUIDELINE',
      'TEMPLATE',
      'PHOTO',
      'VIDEO',
      'OTHER',
    ]),
    storageKey: z.string().trim().max(800).optional(),
    externalUrl: z.string().trim().url().max(1200).optional(),
    version: z.string().trim().max(80).optional(),
    usageRules: z.string().trim().max(5000).optional(),
  })
  .refine((value) => value.storageKey || value.externalUrl, {
    message: 'Brand asset requires storageKey or externalUrl.',
  });

export const createProviderConnectionSchema = z.object({
  provider: z.enum(['META', 'GOOGLE_ADS', 'TIKTOK', 'OTHER']),
  externalAccountId: z.string().trim().max(240).optional(),
  displayName: z.string().trim().min(2).max(180),
});

export const routingConditionsSchema = z
  .object({
    autoFollowUp: z.boolean().default(true),
    followUpSlaMinutes: z.coerce.number().int().min(1).max(10080).default(15),
    followUpChannel: z
      .enum(['CALL', 'SMS', 'EMAIL', 'WHATSAPP', 'IN_PERSON', 'OTHER'])
      .default('CALL'),
  })
  .catchall(z.unknown())
  .default({
    autoFollowUp: true,
    followUpSlaMinutes: 15,
    followUpChannel: 'CALL',
  });

export const createRoutingRuleSchema = z.object({
  name: z.string().trim().min(2).max(180),
  priority: z.coerce.number().int().min(1).max(10000).default(100),
  provider: marketingProviderSchema.exclude(['MANUAL']).optional(),
  campaignId: z.string().uuid().optional(),
  targetBranchId: z.string().uuid().optional(),
  targetUserId: z.string().uuid().optional(),
  strategy: z
    .enum(['FIXED', 'ROUND_ROBIN', 'LEAST_LOADED'])
    .default('FIXED'),
  conditions: routingConditionsSchema,
});

export const contentPlatformSchema = z.enum([
  'INSTAGRAM',
  'FACEBOOK',
  'TIKTOK',
  'YOUTUBE',
  'LINKEDIN',
  'WEBSITE',
  'EMAIL',
  'SMS',
  'WHATSAPP',
  'OTHER',
]);

export const contentFormatSchema = z.enum([
  'POST',
  'REEL',
  'STORY',
  'VIDEO',
  'ARTICLE',
  'EMAIL',
  'SMS',
  'BANNER',
  'OTHER',
]);

export const contentStatusSchema = z.enum([
  'IDEA',
  'BRIEF',
  'PRODUCTION',
  'REVIEW',
  'APPROVED',
  'SCHEDULED',
  'PUBLISHED',
  'ARCHIVED',
]);

export const createContentItemSchema = z.object({
  title: z.string().trim().min(2).max(240),
  platform: contentPlatformSchema,
  format: contentFormatSchema,
  branchId: z.string().uuid().nullable().optional(),
  campaignId: z.string().uuid().nullable().optional(),
  caption: z.string().trim().max(10000).nullable().optional(),
  cta: z.string().trim().max(1000).nullable().optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const updateContentDraftSchema = z.object({
  title: z.string().trim().min(2).max(240).optional(),
  platform: contentPlatformSchema.optional(),
  format: contentFormatSchema.optional(),
  campaignId: z.string().uuid().nullable().optional(),
  caption: z.string().trim().max(10000).nullable().optional(),
  cta: z.string().trim().max(1000).nullable().optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const listContentItemsSchema = z.object({
  status: contentStatusSchema.optional(),
  platform: contentPlatformSchema.optional(),
  campaignId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const contentDecisionSchema = z.object({
  note: z.string().trim().min(1).max(3000),
});

export const scheduleContentSchema = z.object({
  scheduledAt: z.coerce.date(),
});

export const publishContentSchema = z.object({
  publishedAt: z.coerce.date().optional(),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type CreateMarketingLeadInput = z.infer<
  typeof createMarketingLeadSchema
>;
export type CreateMarketingAppointmentInput = z.infer<
  typeof createMarketingAppointmentSchema
>;
export type CreateBrandAssetInput = z.infer<typeof createBrandAssetSchema>;
export type CreateProviderConnectionInput = z.infer<
  typeof createProviderConnectionSchema
>;
export type CreateRoutingRuleInput = z.infer<typeof createRoutingRuleSchema>;
export type RoutingConditionsInput = z.infer<typeof routingConditionsSchema>;
export type CreateContentItemInput = z.infer<typeof createContentItemSchema>;
export type UpdateContentDraftInput = z.infer<typeof updateContentDraftSchema>;
export type ContentDecisionInput = z.infer<typeof contentDecisionSchema>;
export type ScheduleContentInput = z.infer<typeof scheduleContentSchema>;
export type PublishContentInput = z.infer<typeof publishContentSchema>;
